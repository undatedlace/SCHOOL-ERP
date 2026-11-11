import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { Page, skipTake } from '../../common/dto/page-query.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  isIsoDate,
  toDate,
  toIso,
  todayInIndia,
} from '../attendance/attendance-rules.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  CreateHomeworkDto,
  ListHomeworkQueryDto,
  UpdateHomeworkDto,
} from './dto/homework.dto.js';

const INCLUDE = {
  createdBy: { select: { id: true, fullName: true } },
  subject: { select: { id: true, name: true } },
  targets: {
    include: {
      division: {
        select: {
          id: true,
          name: true,
          class: { select: { name: true } },
        },
      },
      student: {
        select: { id: true, firstName: true, surname: true },
      },
    },
  },
} satisfies Prisma.HomeworkInclude;
type Row = Prisma.HomeworkGetPayload<{ include: typeof INCLUDE }>;

interface Child {
  studentId: string;
  divisionId: string;
  name: string;
}

@Injectable()
export class HomeworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private can = (auth: AuthContext, p: string) => auth.permissions.includes(p);

  private async currentYear(schoolId: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    if (!year) {
      throw new BadRequestException(
        'There is no current academic year. Set one in Academic setup.',
      );
    }
    return year.id;
  }

  /** Divisions the person teaches this year (class teacher or subject teacher). */
  private async taught(
    auth: AuthContext,
    yearId: string,
  ): Promise<Set<string>> {
    const where = {
      schoolId: auth.schoolId,
      academicYearId: yearId,
      staff: { userId: auth.userId, status: 'ACTIVE' as const },
    };
    const [a, b] = await Promise.all([
      this.prisma.classTeacher.findMany({
        where,
        select: { divisionId: true },
      }),
      this.prisma.subjectTeacher.findMany({
        where,
        select: { divisionId: true },
      }),
    ]);
    return new Set([...a, ...b].map((r) => r.divisionId));
  }

  /** The signed-in person's children (or themselves, for a student) with their division this year. */
  private async children(auth: AuthContext, yearId: string): Promise<Child[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        schoolId: auth.schoolId,
        academicYearId: yearId,
        student: {
          status: 'ACTIVE',
          OR: [
            { userId: auth.userId },
            { guardians: { some: { guardian: { userId: auth.userId } } } },
          ],
        },
      },
      select: {
        divisionId: true,
        student: { select: { id: true, firstName: true, surname: true } },
      },
    });
    return rows.map((r) => ({
      studentId: r.student.id,
      divisionId: r.divisionId,
      name: `${r.student.firstName} ${r.student.surname}`,
    }));
  }

  /** What this person may see: their own, everything for an administrator, and what is set for their children. */
  private async visible(
    auth: AuthContext,
    yearId: string,
    kids: Child[],
  ): Promise<Prisma.HomeworkWhereInput> {
    const base = { schoolId: auth.schoolId, archivedAt: null };
    if (this.can(auth, 'homework.manage_all')) return base;
    const or: Prisma.HomeworkWhereInput[] = [];
    if (this.can(auth, 'homework.manage'))
      or.push({ createdById: auth.userId });
    if (this.can(auth, 'homework.read') && kids.length) {
      or.push({
        academicYearId: yearId,
        targets: {
          some: {
            OR: [
              { divisionId: { in: kids.map((k) => k.divisionId) } },
              { studentId: { in: kids.map((k) => k.studentId) } },
            ],
          },
        },
      });
    }
    // Someone with neither right sees nothing at all.
    return or.length ? { ...base, OR: or } : { ...base, id: { in: [] } };
  }

  async audiences(auth: AuthContext) {
    const yearId = await this.currentYear(auth.schoolId);
    const mine = this.can(auth, 'homework.manage_all')
      ? null
      : await this.taught(auth, yearId);
    const divisions = await this.prisma.division.findMany({
      where: {
        schoolId: auth.schoolId,
        ...(mine ? { id: { in: [...mine] } } : {}),
      },
      select: {
        id: true,
        name: true,
        class: { select: { id: true, name: true, sortOrder: true } },
      },
    });
    divisions.sort(
      (a, b) =>
        a.class.sortOrder - b.class.sortOrder || a.name.localeCompare(b.name),
    );
    return {
      divisions: divisions.map((d) => ({
        id: d.id,
        classId: d.class.id,
        label: `${d.class.name}-${d.name}`,
      })),
    };
  }

  async create(auth: AuthContext, dto: CreateHomeworkDto, ip?: string) {
    const divisionIds = [...new Set(dto.divisionIds ?? [])];
    const studentIds = [...new Set(dto.studentIds ?? [])];
    if (divisionIds.length + studentIds.length === 0) {
      throw new BadRequestException(
        'Choose who it is for: one or more divisions, or individual students',
      );
    }
    if (dto.dueOn && !isIsoDate(dto.dueOn)) {
      throw new BadRequestException('The due day is not a real date');
    }
    if (dto.dueOn && dto.dueOn < todayInIndia()) {
      throw new BadRequestException('The due day cannot be in the past');
    }
    const yearId = await this.currentYear(auth.schoolId);

    const divisions = divisionIds.length
      ? await this.prisma.division.count({
          where: { schoolId: auth.schoolId, id: { in: divisionIds } },
        })
      : 0;
    if (divisions !== divisionIds.length) {
      throw new BadRequestException('A chosen division does not exist');
    }
    const enrolled = studentIds.length
      ? await this.prisma.enrollment.findMany({
          where: {
            schoolId: auth.schoolId,
            academicYearId: yearId,
            studentId: { in: studentIds },
            student: { status: 'ACTIVE' },
          },
          select: { studentId: true, divisionId: true },
        })
      : [];
    if (enrolled.length !== studentIds.length) {
      throw new BadRequestException(
        'A chosen student is not a current student this year',
      );
    }
    // A teacher sets homework only for the divisions they teach, and for students in them.
    if (!this.can(auth, 'homework.manage_all')) {
      const mine = await this.taught(auth, yearId);
      if (
        divisionIds.some((d) => !mine.has(d)) ||
        enrolled.some((e) => !mine.has(e.divisionId))
      ) {
        throw new ForbiddenException(
          'You can set homework only for the divisions you teach',
        );
      }
    }
    if (dto.subjectId) {
      const s = await this.prisma.subject.count({
        where: { id: dto.subjectId, schoolId: auth.schoolId },
      });
      if (!s) throw new BadRequestException('That subject does not exist');
    }

    const created = await this.prisma.homework.create({
      data: {
        schoolId: auth.schoolId,
        academicYearId: yearId,
        title: dto.title,
        instructions: dto.instructions,
        subjectId: dto.subjectId ?? null,
        dueOn: dto.dueOn ? toDate(dto.dueOn) : null,
        createdById: auth.userId,
        targets: {
          create: [
            ...divisionIds.map((divisionId) => ({ divisionId })),
            ...studentIds.map((studentId) => ({ studentId })),
          ],
        },
      },
      include: INCLUDE,
    });
    await this.record(auth, 'homework.created', created.id, ip, {
      divisions: divisionIds.length,
      students: studentIds.length,
    });
    await this.tellFamilies(
      auth.schoolId,
      yearId,
      created,
      divisionIds,
      studentIds,
    );
    return this.view(auth, created, []);
  }

  /** Tells the parents and the students themselves, in the app. */
  private async tellFamilies(
    schoolId: string,
    yearId: string,
    h: Row,
    divisionIds: string[],
    studentIds: string[],
  ) {
    const fromDivisions = divisionIds.length
      ? await this.prisma.enrollment.findMany({
          where: {
            schoolId,
            academicYearId: yearId,
            divisionId: { in: divisionIds },
            student: { status: 'ACTIVE' },
          },
          select: { studentId: true },
        })
      : [];
    const ids = [
      ...new Set([...studentIds, ...fromDivisions.map((e) => e.studentId)]),
    ];
    if (ids.length === 0) return;
    const students = await this.prisma.student.findMany({
      where: { id: { in: ids } },
      select: {
        userId: true,
        guardians: { select: { guardian: { select: { userId: true } } } },
      },
    });
    const users = students.flatMap((s) => [
      s.userId,
      ...s.guardians.map((g) => g.guardian.userId),
    ]);
    await this.notifications.notify(schoolId, users, {
      type: 'homework.assigned',
      title: `New homework: ${h.title}${h.subject ? ` (${h.subject.name})` : ''}`,
      body: h.dueOn ? `Due ${toIso(h.dueOn)}` : undefined,
      link: '/portal/homework',
    });
  }

  async list(
    auth: AuthContext,
    q: ListHomeworkQueryDto,
  ): Promise<Page<ReturnType<HomeworkService['view']>>> {
    const yearId = await this.currentYear(auth.schoolId);
    const kids = await this.children(auth, yearId);
    const today = toDate(todayInIndia());
    const where: Prisma.HomeworkWhereInput = {
      AND: [
        await this.visible(auth, yearId, kids),
        { academicYearId: yearId },
        (q.status ?? 'open') === 'open'
          ? { OR: [{ dueOn: null }, { dueOn: { gte: today } }] }
          : {},
        q.subjectId ? { subjectId: q.subjectId } : {},
        q.divisionId ? { targets: { some: { divisionId: q.divisionId } } } : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.homework.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.homework.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.view(auth, r, kids)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async one(auth: AuthContext, id: string) {
    const yearId = await this.currentYear(auth.schoolId);
    const kids = await this.children(auth, yearId);
    const row = await this.prisma.homework.findFirst({
      where: { AND: [{ id }, await this.visible(auth, yearId, kids)] },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Homework not found');
    return this.view(auth, row, kids);
  }

  async update(
    auth: AuthContext,
    id: string,
    dto: UpdateHomeworkDto,
    ip?: string,
  ) {
    const row = await this.mayChange(auth, id);
    if (dto.dueOn && !isIsoDate(dto.dueOn)) {
      throw new BadRequestException('The due day is not a real date');
    }
    if (dto.subjectId) {
      const s = await this.prisma.subject.count({
        where: { id: dto.subjectId, schoolId: auth.schoolId },
      });
      if (!s) throw new BadRequestException('That subject does not exist');
    }
    await this.prisma.homework.update({
      where: { id: row.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.instructions !== undefined
          ? { instructions: dto.instructions }
          : {}),
        ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId } : {}),
        ...(dto.dueOn !== undefined
          ? { dueOn: dto.dueOn ? toDate(dto.dueOn) : null }
          : {}),
      },
    });
    await this.record(auth, 'homework.updated', id, ip, {
      fields: Object.keys(dto).join(','),
    });
    return this.one(auth, id);
  }

  /** Takes homework down. It is kept, never deleted. */
  async archive(auth: AuthContext, id: string, ip?: string) {
    await this.mayChange(auth, id);
    await this.prisma.homework.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.record(auth, 'homework.archived', id, ip);
  }

  /** The author or an administrator; someone who cannot even see it gets "not found". */
  private async mayChange(auth: AuthContext, id: string) {
    const row = await this.prisma.homework.findFirst({
      where: { id, schoolId: auth.schoolId, archivedAt: null },
      select: { id: true, createdById: true },
    });
    if (!row) throw new NotFoundException('Homework not found');
    if (
      row.createdById !== auth.userId &&
      !this.can(auth, 'homework.manage_all')
    ) {
      await this.one(auth, id); // 404 when they cannot see it either
      throw new ForbiddenException(
        'Only the author or an administrator can change homework',
      );
    }
    return row;
  }

  private view(auth: AuthContext, r: Row, kids: Child[]) {
    const divisionIds = new Set(
      r.targets.flatMap((t) => (t.divisionId ? [t.divisionId] : [])),
    );
    const studentIds = new Set(
      r.targets.flatMap((t) => (t.studentId ? [t.studentId] : [])),
    );
    const today = todayInIndia();
    const due = r.dueOn ? toIso(r.dueOn) : null;
    return {
      id: r.id,
      title: r.title,
      instructions: r.instructions,
      subject: r.subject,
      dueOn: due,
      overdue: due !== null && due < today,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      divisions: r.targets.flatMap((t) =>
        t.division
          ? [
              {
                id: t.division.id,
                label: `${t.division.class.name}-${t.division.name}`,
              },
            ]
          : [],
      ),
      students: r.targets.flatMap((t) =>
        t.student
          ? [
              {
                id: t.student.id,
                name: `${t.student.firstName} ${t.student.surname}`,
              },
            ]
          : [],
      ),
      /** For a parent or student: which of their children this is for. */
      forChildren: kids
        .filter(
          (k) => divisionIds.has(k.divisionId) || studentIds.has(k.studentId),
        )
        .map((k) => k.name),
      canChange:
        r.createdById === auth.userId || this.can(auth, 'homework.manage_all'),
    };
  }

  private record(
    auth: AuthContext,
    action: string,
    entityId: string,
    ip?: string,
    metadata?: Prisma.InputJsonObject,
  ) {
    return this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action,
      entityType: 'homework',
      entityId,
      metadata,
      ip,
    });
  }
}
