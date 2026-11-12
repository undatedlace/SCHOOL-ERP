import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import {
  AssignDto,
  CopyAssignmentsDto,
  ListAssignmentsQueryDto,
} from './dto/teaching.dto.js';

const INCLUDE = {
  academicYear: { select: { id: true, name: true } },
  division: {
    select: {
      id: true,
      name: true,
      class: { select: { id: true, name: true, sortOrder: true } },
    },
  },
  staff: {
    select: { id: true, firstName: true, surname: true, status: true },
  },
} satisfies Prisma.ClassTeacherInclude;

const SUBJECT_INCLUDE = {
  ...INCLUDE,
  subject: { select: { id: true, name: true } },
} satisfies Prisma.SubjectTeacherInclude;

type ClassRow = Prisma.ClassTeacherGetPayload<{ include: typeof INCLUDE }>;
type SubjectRow = Prisma.SubjectTeacherGetPayload<{
  include: typeof SUBJECT_INCLUDE;
}>;

export interface Assignment {
  id: string;
  kind: 'CLASS_TEACHER' | 'SUBJECT';
  academicYear: { id: string; name: string };
  division: { id: string; name: string; class: { id: string; name: string } };
  subject: { id: string; name: string } | null;
  staff: { id: string; fullName: string; status: 'ACTIVE' | 'LEFT' };
}

const base = (r: ClassRow | SubjectRow) => ({
  id: r.id,
  academicYear: r.academicYear,
  division: {
    id: r.division.id,
    name: r.division.name,
    class: { id: r.division.class.id, name: r.division.class.name },
  },
  staff: {
    id: r.staff.id,
    fullName: `${r.staff.firstName} ${r.staff.surname}`,
    status: r.staff.status,
  },
});

const fromClass = (r: ClassRow): Assignment => ({
  ...base(r),
  kind: 'CLASS_TEACHER',
  subject: null,
});
const fromSubject = (r: SubjectRow): Assignment => ({
  ...base(r),
  kind: 'SUBJECT',
  subject: r.subject,
});

@Injectable()
export class TeachingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(auth: AuthContext, q: ListAssignmentsQueryDto) {
    const academicYearId =
      q.academicYearId ?? (await this.currentYearId(auth.schoolId));
    if (!academicYearId) return [];
    const where = {
      schoolId: auth.schoolId,
      academicYearId,
      ...(q.divisionId ? { divisionId: q.divisionId } : {}),
      ...(q.staffId ? { staffId: q.staffId } : {}),
    };
    return this.collect(where);
  }

  /** The signed-in teacher's own classes and subjects this year. */
  async mine(auth: AuthContext) {
    const [staff, academicYearId] = await Promise.all([
      this.prisma.staff.findFirst({
        where: { schoolId: auth.schoolId, userId: auth.userId },
        select: { id: true },
      }),
      this.currentYearId(auth.schoolId),
    ]);
    if (!staff || !academicYearId) return [];
    return this.collect({
      schoolId: auth.schoolId,
      academicYearId,
      staffId: staff.id,
    });
  }

  async assign(auth: AuthContext, dto: AssignDto, ip?: string) {
    const academicYearId =
      dto.academicYearId ?? (await this.currentYearId(auth.schoolId));
    if (!academicYearId)
      throw new BadRequestException('Set a current academic year first');
    await this.assertParts(auth.schoolId, {
      staffId: dto.staffId,
      divisionId: dto.divisionId,
      subjectId: dto.subjectId,
      academicYearId,
    });

    try {
      const created = dto.subjectId
        ? await this.prisma.subjectTeacher.create({
            data: {
              schoolId: auth.schoolId,
              academicYearId,
              divisionId: dto.divisionId,
              subjectId: dto.subjectId,
              staffId: dto.staffId,
            },
          })
        : await this.prisma.classTeacher.create({
            data: {
              schoolId: auth.schoolId,
              academicYearId,
              divisionId: dto.divisionId,
              staffId: dto.staffId,
            },
          });
      await this.record(
        auth,
        'teaching.assigned',
        created.id,
        {
          kind: dto.subjectId ? 'subject' : 'class_teacher',
        },
        ip,
      );
      return this.one(auth.schoolId, created.id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          await this.takenMessage(auth.schoolId, academicYearId, dto),
        );
      }
      throw error;
    }
  }

  /** Hands an assignment over to a different teacher. */
  async change(auth: AuthContext, id: string, staffId: string, ip?: string) {
    const current = await this.one(auth.schoolId, id);
    await this.assertStaff(auth.schoolId, staffId);
    if (current.kind === 'CLASS_TEACHER') {
      await this.prisma.classTeacher.update({
        where: { id },
        data: { staffId },
      });
    } else {
      await this.prisma.subjectTeacher.update({
        where: { id },
        data: { staffId },
      });
    }
    await this.record(auth, 'teaching.changed', id, {}, ip);
    return this.one(auth.schoolId, id);
  }

  async remove(auth: AuthContext, id: string, ip?: string) {
    const current = await this.one(auth.schoolId, id);
    if (current.kind === 'CLASS_TEACHER') {
      await this.prisma.classTeacher.delete({ where: { id } });
    } else {
      await this.prisma.subjectTeacher.delete({ where: { id } });
    }
    await this.record(auth, 'teaching.removed', id, {}, ip);
  }

  /**
   * Carries a year's class teachers and subject teachers into another year (normally the new one),
   * so the office only changes what is different. A place that already has a teacher in the target
   * year is left as it is, and so is anyone who has since left the school; both are reported.
   * Nothing else is touched, and running it again copies nothing new.
   */
  async copy(auth: AuthContext, dto: CopyAssignmentsDto, ip?: string) {
    if (dto.fromAcademicYearId === dto.toAcademicYearId) {
      throw new BadRequestException('Choose two different years');
    }
    const [from, to] = await Promise.all([
      this.yearOrThrow(auth.schoolId, dto.fromAcademicYearId),
      this.yearOrThrow(auth.schoolId, dto.toAcademicYearId),
    ]);
    const schoolId = auth.schoolId;
    const place = {
      division: {
        select: {
          name: true,
          class: { select: { name: true, sortOrder: true } },
        },
      },
      staff: { select: { status: true } },
    } as const;

    const [classSources, subjectSources, classTaken, subjectTaken] =
      await Promise.all([
        this.prisma.classTeacher.findMany({
          where: { schoolId, academicYearId: from.id },
          include: place,
        }),
        this.prisma.subjectTeacher.findMany({
          where: { schoolId, academicYearId: from.id },
          include: { ...place, subject: { select: { name: true } } },
        }),
        this.prisma.classTeacher.findMany({
          where: { schoolId, academicYearId: to.id },
          select: { divisionId: true },
        }),
        this.prisma.subjectTeacher.findMany({
          where: { schoolId, academicYearId: to.id },
          select: { divisionId: true, subjectId: true },
        }),
      ]);
    const hasClass = new Set(classTaken.map((r) => r.divisionId));
    const hasSubject = new Set(
      subjectTaken.map((r) => `${r.divisionId}:${r.subjectId}`),
    );

    const skipped: { place: string; role: string; reason: string }[] = [];
    const toClass: Prisma.ClassTeacherCreateManyInput[] = [];
    const toSubject: Prisma.SubjectTeacherCreateManyInput[] = [];
    const label = (d: { name: string; class: { name: string } }) =>
      `${d.class.name}-${d.name}`;

    const sources = [
      ...classSources.map((r) => ({
        r,
        subjectId: null as string | null,
        subjectName: null as string | null,
      })),
      ...subjectSources.map((r) => ({
        r,
        subjectId: r.subjectId as string | null,
        subjectName: r.subject.name as string | null,
      })),
    ].sort(
      (a, b) =>
        a.r.division.class.sortOrder - b.r.division.class.sortOrder ||
        label(a.r.division).localeCompare(label(b.r.division)) ||
        (a.subjectName ?? '').localeCompare(b.subjectName ?? ''),
    );
    for (const { r, subjectId, subjectName } of sources) {
      const where = label(r.division);
      const role = subjectName ?? 'Class teacher';
      if (r.staff.status !== 'ACTIVE') {
        skipped.push({
          place: where,
          role,
          reason: 'The teacher has left the school',
        });
        continue;
      }
      if (subjectId) {
        if (hasSubject.has(`${r.divisionId}:${subjectId}`)) {
          skipped.push({
            place: where,
            role,
            reason: `Already has a teacher for ${to.name}`,
          });
          continue;
        }
        toSubject.push({
          schoolId,
          academicYearId: to.id,
          divisionId: r.divisionId,
          subjectId,
          staffId: r.staffId,
        });
      } else {
        if (hasClass.has(r.divisionId)) {
          skipped.push({
            place: where,
            role,
            reason: `Already has a class teacher for ${to.name}`,
          });
          continue;
        }
        toClass.push({
          schoolId,
          academicYearId: to.id,
          divisionId: r.divisionId,
          staffId: r.staffId,
        });
      }
    }

    // All or nothing. skipDuplicates keeps a simultaneous copy from failing on the unique places.
    const [classes, subjects] = await this.prisma.$transaction([
      this.prisma.classTeacher.createMany({
        data: toClass,
        skipDuplicates: true,
      }),
      this.prisma.subjectTeacher.createMany({
        data: toSubject,
        skipDuplicates: true,
      }),
    ]);

    await this.audit.log({
      schoolId,
      actorUserId: auth.userId,
      action: 'teaching.assignments_copied',
      entityType: 'academic_year',
      entityId: to.id,
      metadata: {
        from: from.name,
        to: to.name,
        classTeachers: classes.count,
        subjectTeachers: subjects.count,
        skipped: skipped.length,
      },
      ip,
    });
    return {
      from: from.name,
      to: to.name,
      copied: { classTeachers: classes.count, subjectTeachers: subjects.count },
      skipped,
    };
  }

  // ---------- helpers ----------

  private async yearOrThrow(schoolId: string, id: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id, schoolId },
      select: { id: true, name: true },
    });
    if (!year) throw new NotFoundException('Academic year not found');
    return year;
  }

  private async collect(where: {
    schoolId: string;
    academicYearId: string;
    divisionId?: string;
    staffId?: string;
  }): Promise<Assignment[]> {
    const [classRows, subjectRows] = await Promise.all([
      this.prisma.classTeacher.findMany({ where, include: INCLUDE }),
      this.prisma.subjectTeacher.findMany({
        where,
        include: SUBJECT_INCLUDE,
      }),
    ]);
    const order = (a: {
      division: { name: string; class: { sortOrder: number } };
    }) => a.division.class.sortOrder;
    const all = [
      ...classRows.map((r) => ({ view: fromClass(r), order: order(r) })),
      ...subjectRows.map((r) => ({ view: fromSubject(r), order: order(r) })),
    ];
    // By class, then division, then the class teacher first, then subjects by name.
    return all
      .sort(
        (a, b) =>
          a.order - b.order ||
          a.view.division.class.name.localeCompare(
            b.view.division.class.name,
          ) ||
          a.view.division.name.localeCompare(b.view.division.name) ||
          Number(b.view.kind === 'CLASS_TEACHER') -
            Number(a.view.kind === 'CLASS_TEACHER') ||
          (a.view.subject?.name ?? '').localeCompare(
            b.view.subject?.name ?? '',
          ),
      )
      .map((x) => x.view);
  }

  private async one(schoolId: string, id: string): Promise<Assignment> {
    const asClass = await this.prisma.classTeacher.findFirst({
      where: { id, schoolId },
      include: INCLUDE,
    });
    if (asClass) return fromClass(asClass);
    const asSubject = await this.prisma.subjectTeacher.findFirst({
      where: { id, schoolId },
      include: SUBJECT_INCLUDE,
    });
    if (asSubject) return fromSubject(asSubject);
    throw new NotFoundException('Assignment not found');
  }

  private async assertParts(
    schoolId: string,
    p: {
      staffId: string;
      divisionId: string;
      subjectId?: string;
      academicYearId: string;
    },
  ) {
    await this.assertStaff(schoolId, p.staffId);
    const [division, year, subject] = await Promise.all([
      this.prisma.division.findFirst({
        where: { id: p.divisionId, schoolId },
        select: { id: true },
      }),
      this.prisma.academicYear.findFirst({
        where: { id: p.academicYearId, schoolId },
        select: { id: true },
      }),
      p.subjectId
        ? this.prisma.subject.findFirst({
            where: { id: p.subjectId, schoolId },
            select: { id: true },
          })
        : Promise.resolve(true),
    ]);
    if (!division) throw new NotFoundException('Division not found');
    if (!year) throw new NotFoundException('Academic year not found');
    if (!subject) throw new NotFoundException('Subject not found');
  }

  private async assertStaff(schoolId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, schoolId },
      select: { status: true },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    if (staff.status !== 'ACTIVE') {
      throw new BadRequestException(
        'That person has left. Choose a current member of staff.',
      );
    }
  }

  /** Says who already holds the place, so the office knows what to change. */
  private async takenMessage(
    schoolId: string,
    academicYearId: string,
    dto: AssignDto,
  ): Promise<string> {
    const where = { schoolId, academicYearId, divisionId: dto.divisionId };
    const division = await this.prisma.division.findUnique({
      where: { id: dto.divisionId },
      select: { name: true, class: { select: { name: true } } },
    });
    const place = division
      ? `${division.class.name}-${division.name}`
      : 'This division';
    const hint = 'Change or remove that assignment first.';

    if (dto.subjectId) {
      const holder = await this.prisma.subjectTeacher.findFirst({
        where: { ...where, subjectId: dto.subjectId },
        include: { staff: true, subject: true },
      });
      return holder
        ? `${holder.staff.firstName} ${holder.staff.surname} already teaches ${holder.subject.name} in ${place}. ${hint}`
        : `That subject already has a teacher in ${place}. ${hint}`;
    }
    const holder = await this.prisma.classTeacher.findFirst({
      where,
      include: { staff: true },
    });
    return holder
      ? `${place} already has ${holder.staff.firstName} ${holder.staff.surname} as class teacher. ${hint}`
      : `${place} already has a class teacher. ${hint}`;
  }

  private async currentYearId(schoolId: string): Promise<string | null> {
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    return year?.id ?? null;
  }

  private record(
    auth: AuthContext,
    action: string,
    entityId: string,
    metadata: Prisma.InputJsonObject,
    ip?: string,
  ) {
    return this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action,
      entityType: 'teaching_assignment',
      entityId,
      metadata,
      ip,
    });
  }
}
