import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { dateOnly, todayIso } from '../../common/dates.js';
import { Page, skipTake } from '../../common/dto/page-query.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { Gender } from '../../generated/prisma/enums.js';
import { AuditService } from '../audit/audit.service.js';
import {
  GuardianInputDto,
  ListStudentsQueryDto,
  UpdateGuardianDto,
  UpdateStudentDto,
} from './dto/students.dto.js';

type Tx = Prisma.TransactionClient;

const CURRENT_INCLUDE = (academicYearId: string | null) =>
  ({
    enrollments: {
      // No current year: match nothing. (An empty string is not a valid uuid.)
      where: academicYearId ? { academicYearId } : { OR: [] },
      take: 1,
      include: {
        division: {
          select: {
            id: true,
            name: true,
            class: { select: { id: true, name: true } },
          },
        },
        academicYear: { select: { id: true, name: true } },
      },
    },
  }) satisfies Prisma.StudentInclude;

type ListRow = Prisma.StudentGetPayload<{
  include: ReturnType<typeof CURRENT_INCLUDE>;
}>;

const fullName = (s: {
  firstName: string;
  fatherName: string | null;
  surname: string;
}) => [s.firstName, s.fatherName, s.surname].filter(Boolean).join(' ');

const listItem = (s: ListRow) => {
  const e = s.enrollments[0];
  return {
    id: s.id,
    admissionNo: s.admissionNo,
    fullName: fullName(s),
    firstName: s.firstName,
    surname: s.surname,
    gender: s.gender,
    dateOfBirth: s.dateOfBirth,
    status: s.status,
    photoFileId: s.photoFileId,
    current: e
      ? {
          academicYear: e.academicYear,
          class: e.division.class,
          division: { id: e.division.id, name: e.division.name },
        }
      : null,
  };
};

/** What the school needs to create a student. */
export interface NewStudent {
  firstName: string;
  fatherName?: string | null;
  surname: string;
  gender: Gender;
  dateOfBirth: string;
  photoFileId?: string | null;
  admissionNo?: string;
  joinedOn?: string;
  academicYearId: string;
  divisionId: string;
  guardians: GuardianInputDto[];
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Who may see which students.
   *  - students.read_all (admin, office, accountant): everyone.
   *  - Anyone else with students.read: the students they are a guardian of, plus,
   *    for a teacher, the students of the divisions they teach (class teacher or
   *    subject teacher) this academic year.
   * A teacher who left, or whose assignment was removed, loses that access at once.
   */
  private async visible(auth: AuthContext): Promise<Prisma.StudentWhereInput> {
    if (auth.permissions.includes('students.read_all')) return {};

    const own: Prisma.StudentWhereInput = {
      OR: [
        { guardians: { some: { guardian: { userId: auth.userId } } } },
        { userId: auth.userId }, // a student sees themself
      ],
    };
    const academicYearId = await this.currentYearId(auth.schoolId);
    if (!academicYearId) return own;

    const teacher = {
      staff: { userId: auth.userId, status: 'ACTIVE' as const },
    };
    const taught: Prisma.DivisionWhereInput = {
      OR: [
        { classTeachers: { some: { academicYearId, ...teacher } } },
        { subjectTeachers: { some: { academicYearId, ...teacher } } },
      ],
    };
    return {
      OR: [
        own,
        { enrollments: { some: { academicYearId, division: taught } } },
      ],
    };
  }

  /** Throws 404 unless this user may see the student (the same answer as "does not exist"). */
  async assertVisible(auth: AuthContext, id: string) {
    const found = await this.prisma.student.findFirst({
      where: { id, schoolId: auth.schoolId, AND: [await this.visible(auth)] },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Student not found');
  }

  async list(
    auth: AuthContext,
    q: ListStudentsQueryDto,
  ): Promise<Page<ReturnType<typeof listItem>>> {
    const yearId =
      q.academicYearId ?? (await this.currentYearId(auth.schoolId));
    const classFilter: Prisma.EnrollmentWhereInput = {
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(q.divisionId ? { divisionId: q.divisionId } : {}),
      ...(q.classId ? { division: { classId: q.classId } } : {}),
    };
    const where: Prisma.StudentWhereInput = {
      schoolId: auth.schoolId,
      // In an AND of its own: the scope and the search both use OR, and one must not replace the other.
      AND: [await this.visible(auth)],
      ...(q.status ? { status: q.status } : {}),
      ...(q.gender ? { gender: q.gender } : {}),
      ...(q.joinedFrom || q.joinedTo
        ? {
            joinedOn: {
              ...(q.joinedFrom ? { gte: dateOnly(q.joinedFrom) } : {}),
              ...(q.joinedTo ? { lte: dateOnly(q.joinedTo) } : {}),
            },
          }
        : {}),
      ...(q.hasLogin === undefined
        ? {}
        : { userId: q.hasLogin ? { not: null } : null }),
      ...(q.divisionId || q.classId
        ? { enrollments: { some: classFilter } }
        : {}),
      ...(q.search
        ? {
            OR: [
              { firstName: { contains: q.search, mode: 'insensitive' } },
              { fatherName: { contains: q.search, mode: 'insensitive' } },
              { surname: { contains: q.search, mode: 'insensitive' } },
              { admissionNo: { contains: q.search, mode: 'insensitive' } },
              // A parent's name or phone number finds the child.
              {
                guardians: {
                  some: {
                    guardian: {
                      OR: [
                        {
                          fullName: { contains: q.search, mode: 'insensitive' },
                        },
                        { mobile: { contains: q.search } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        include: CURRENT_INCLUDE(yearId),
        orderBy: [{ surname: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.student.count({ where }),
    ]);
    return {
      items: rows.map(listItem),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async findOne(auth: AuthContext, id: string) {
    const wide = auth.permissions.includes('students.read_all');
    const s = await this.prisma.student.findFirst({
      where: { id, schoolId: auth.schoolId, ...(await this.visible(auth)) },
      include: {
        guardians: {
          include: { guardian: true },
          orderBy: [{ isPrimary: 'desc' }, { relationship: 'asc' }],
        },
        enrollments: {
          orderBy: { startedOn: 'desc' },
          include: {
            academicYear: { select: { id: true, name: true } },
            division: {
              select: {
                id: true,
                name: true,
                class: { select: { id: true, name: true } },
              },
            },
          },
        },
        application: { select: { id: true, formNo: true } },
      },
    });
    // Same answer for "does not exist" and "not yours to see".
    if (!s) throw new NotFoundException('Student not found');

    return {
      id: s.id,
      admissionNo: s.admissionNo,
      fullName: fullName(s),
      firstName: s.firstName,
      fatherName: s.fatherName,
      surname: s.surname,
      gender: s.gender,
      dateOfBirth: s.dateOfBirth,
      status: s.status,
      joinedOn: s.joinedOn,
      leftOn: s.leftOn,
      photoFileId: s.photoFileId,
      hasLogin: !!s.userId,
      guardians: s.guardians.map((g) => ({
        id: g.guardian.id,
        fullName: g.guardian.fullName,
        mobile: g.guardian.mobile,
        email: g.guardian.email,
        occupation: g.guardian.occupation,
        relationship: g.relationship,
        isPrimary: g.isPrimary,
        hasLogin: !!g.guardian.userId,
      })),
      enrollments: s.enrollments.map((e) => ({
        id: e.id,
        academicYear: e.academicYear,
        class: e.division.class,
        division: { id: e.division.id, name: e.division.name },
        startedOn: e.startedOn,
        endedOn: e.endedOn,
      })),
      // Admissions paperwork is for staff, not for a parent looking at their own child.
      application: wide ? s.application : null,
    };
  }

  async update(
    auth: AuthContext,
    id: string,
    dto: UpdateStudentDto,
    ip?: string,
  ) {
    const existing = await this.prisma.student.findFirst({
      where: { id, schoolId: auth.schoolId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Student not found');

    const { dateOfBirth, status, leftOn, ...rest } = dto;
    const data: Prisma.StudentUpdateInput = { ...rest };
    if (dateOfBirth) data.dateOfBirth = dateOnly(dateOfBirth);
    if (status === 'LEFT') {
      data.status = 'LEFT';
      data.leftOn = dateOnly(leftOn ?? todayIso());
    } else if (status === 'ACTIVE') {
      data.status = 'ACTIVE';
      data.leftOn = null;
    } else if (leftOn) {
      throw new BadRequestException(
        'leftOn can only be set together with status LEFT',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const student = await tx.student.update({ where: { id }, data });
        // A student who leaves loses access at once; coming back restores it.
        if (status && student.userId) {
          await tx.user.update({
            where: { id: student.userId },
            data: { status: status === 'LEFT' ? 'DISABLED' : 'ACTIVE' },
          });
          if (status === 'LEFT')
            await tx.session.deleteMany({ where: { userId: student.userId } });
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Admission number ${dto.admissionNo ?? ''} is already used`.trim(),
        );
      }
      throw error;
    }
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action:
        status && status !== existing.status
          ? 'students.status_changed'
          : 'students.updated',
      entityType: 'student',
      entityId: id,
      metadata: {
        fields: Object.keys(dto).join(','),
        ...(status ? { status } : {}),
      },
      ip,
    });
    return this.findOne(auth, id);
  }

  // ---------- guardians ----------

  async addGuardian(
    auth: AuthContext,
    studentId: string,
    input: GuardianInputDto,
    ip?: string,
  ) {
    await this.assertStudent(auth.schoolId, studentId);
    await this.prisma.$transaction((tx) =>
      this.linkGuardians(tx, auth.schoolId, studentId, [input], false),
    );
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'students.guardian_added',
      entityType: 'student',
      entityId: studentId,
      ip,
    });
    return this.findOne(auth, studentId);
  }

  async updateGuardian(
    auth: AuthContext,
    guardianId: string,
    dto: UpdateGuardianDto,
    ip?: string,
  ) {
    const guardian = await this.prisma.guardian.findFirst({
      where: { id: guardianId, schoolId: auth.schoolId },
      select: { id: true },
    });
    if (!guardian) throw new NotFoundException('Guardian not found');
    const updated = await this.prisma.guardian.update({
      where: { id: guardianId },
      data: dto,
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'guardians.updated',
      entityType: 'guardian',
      entityId: guardianId,
      metadata: { fields: Object.keys(dto).join(',') },
      ip,
    });
    return updated;
  }

  /** Removes the link between a student and a guardian. The guardian's other children are not affected. */
  async unlinkGuardian(
    auth: AuthContext,
    studentId: string,
    guardianId: string,
    ip?: string,
  ) {
    await this.assertStudent(auth.schoolId, studentId);
    const links = await this.prisma.studentGuardian.findMany({
      where: { studentId },
    });
    const link = links.find((l) => l.guardianId === guardianId);
    if (!link)
      throw new NotFoundException(
        'That guardian is not linked to this student',
      );
    if (links.length === 1)
      throw new BadRequestException(
        'A student must keep at least one guardian',
      );

    await this.prisma.$transaction(async (tx) => {
      await tx.studentGuardian.delete({
        where: { studentId_guardianId: { studentId, guardianId } },
      });
      if (link.isPrimary) {
        const next = links.find((l) => l.guardianId !== guardianId)!;
        await tx.studentGuardian.update({
          where: {
            studentId_guardianId: { studentId, guardianId: next.guardianId },
          },
          data: { isPrimary: true },
        });
      }
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'students.guardian_removed',
      entityType: 'student',
      entityId: studentId,
      ip,
    });
  }

  // ---------- creating a student (used by the admit flow) ----------

  /**
   * Creates a student with guardians and the first enrollment. Runs inside the
   * caller's transaction so a granted application is either fully admitted or not at all.
   */
  async createInTransaction(tx: Tx, schoolId: string, input: NewStudent) {
    // One student at a time per school, so two admissions can never get the same number.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`students:${schoolId}`}))`;

    const last = await tx.student.aggregate({
      where: { schoolId },
      _max: { seq: true },
    });
    const seq = (last._max.seq ?? 0) + 1;

    let admissionNo = input.admissionNo;
    if (admissionNo) {
      const clash = await tx.student.findFirst({
        where: { schoolId, admissionNo },
        select: { id: true },
      });
      if (clash)
        throw new ConflictException(
          `Admission number ${admissionNo} is already used`,
        );
    } else {
      let candidate = seq;
      while (
        await tx.student.findFirst({
          where: { schoolId, admissionNo: String(candidate) },
          select: { id: true },
        })
      ) {
        candidate++;
      }
      admissionNo = String(candidate);
    }

    const joinedOn = dateOnly(input.joinedOn ?? todayIso());
    const student = await tx.student.create({
      data: {
        schoolId,
        seq,
        admissionNo,
        firstName: input.firstName,
        fatherName: input.fatherName ?? null,
        surname: input.surname,
        gender: input.gender,
        dateOfBirth: dateOnly(input.dateOfBirth),
        photoFileId: input.photoFileId ?? null,
        joinedOn,
      },
    });
    await tx.enrollment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: input.academicYearId,
        divisionId: input.divisionId,
        startedOn: joinedOn,
      },
    });
    await this.linkGuardians(tx, schoolId, student.id, input.guardians, true);
    return student;
  }

  /**
   * Links guardians to a student. A guardian with the same name and mobile number
   * who is already in the school (a brother or sister's parent) is reused, so a
   * parent with two children is one person linked twice.
   */
  private async linkGuardians(
    tx: Tx,
    schoolId: string,
    studentId: string,
    inputs: GuardianInputDto[],
    isFirstSet: boolean,
  ) {
    const hasPrimary = isFirstSet
      ? false
      : !!(await tx.studentGuardian.findFirst({
          where: { studentId, isPrimary: true },
        }));
    const wantsPrimary = inputs.findIndex((g) => g.isPrimary);
    const primaryIndex =
      hasPrimary && wantsPrimary < 0
        ? -1
        : wantsPrimary >= 0
          ? wantsPrimary
          : 0;

    for (const [i, g] of inputs.entries()) {
      const existing = g.mobile
        ? await tx.guardian.findFirst({
            where: {
              schoolId,
              mobile: g.mobile,
              fullName: { equals: g.fullName, mode: 'insensitive' },
            },
          })
        : null;
      const guardian =
        existing ??
        (await tx.guardian.create({
          data: {
            schoolId,
            fullName: g.fullName,
            mobile: g.mobile ?? null,
            email: g.email ?? null,
            occupation: g.occupation ?? null,
          },
        }));

      const already = await tx.studentGuardian.findUnique({
        where: { studentId_guardianId: { studentId, guardianId: guardian.id } },
      });
      if (already)
        throw new ConflictException(
          `${g.fullName} is already linked to this student`,
        );

      const isPrimary = i === primaryIndex;
      if (isPrimary)
        await tx.studentGuardian.updateMany({
          where: { studentId },
          data: { isPrimary: false },
        });
      await tx.studentGuardian.create({
        data: {
          studentId,
          guardianId: guardian.id,
          relationship: g.relationship,
          isPrimary,
        },
      });
    }
  }

  private async assertStudent(schoolId: string, id: string) {
    const s = await this.prisma.student.findFirst({
      where: { id, schoolId },
      select: { id: true },
    });
    if (!s) throw new NotFoundException('Student not found');
  }

  private async currentYearId(schoolId: string): Promise<string | null> {
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    return year?.id ?? null;
  }
}
