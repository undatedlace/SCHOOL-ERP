import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { Page, skipTake } from '../../common/dto/page-query.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { toDate, toIso, todayInIndia } from '../attendance/attendance-rules.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  DecideStudentLeaveDto,
  ListStudentLeaveQueryDto,
  PreviewStudentLeaveQueryDto,
  RequestStudentLeaveDto,
  STUDENT_LEAVE_STATUSES,
} from './dto/student-leave.dto.js';
import { studentHolidayDates } from './student-holidays.js';
import { countDays, windowProblem } from './student-leave-rules.js';

const INCLUDE = {
  student: {
    select: {
      id: true,
      firstName: true,
      surname: true,
      userId: true,
      guardians: { select: { guardian: { select: { userId: true } } } },
      enrollments: {
        select: {
          academicYearId: true,
          divisionId: true,
          division: {
            select: {
              name: true,
              classId: true,
              class: { select: { name: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StudentLeaveRequestInclude;
type Row = Prisma.StudentLeaveRequestGetPayload<{ include: typeof INCLUDE }>;

/** Where a student sits this year. */
interface Place {
  classId: string | null;
  className: string | null;
  divisionId: string | null;
  divisionName: string | null;
}

const NO_PLACE: Place = {
  classId: null,
  className: null,
  divisionId: null,
  divisionName: null,
};

const fullName = (s: { firstName: string; surname: string }) =>
  `${s.firstName} ${s.surname}`;

const range = (from: string, to: string) =>
  from === to ? from : `${from} to ${to}`;

/** Student leave ("Report absence"): families ask, the class teacher or an administrator decides. */
@Injectable()
export class StudentLeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private can = (auth: AuthContext, p: string) => auth.permissions.includes(p);

  private async currentYearId(schoolId: string): Promise<string | null> {
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    return year?.id ?? null;
  }

  // ---------- who may see what ----------

  /** Divisions where the signed-in teacher is class teacher this year. */
  private async classTeacherDivisions(
    auth: AuthContext,
    yearId: string | null,
  ): Promise<Set<string>> {
    if (!yearId || !this.can(auth, 'student_leave.decide')) return new Set();
    const rows = await this.prisma.classTeacher.findMany({
      where: {
        schoolId: auth.schoolId,
        academicYearId: yearId,
        staff: { userId: auth.userId, status: 'ACTIVE' },
      },
      select: { divisionId: true },
    });
    return new Set(rows.map((r) => r.divisionId));
  }

  /** The requests this person may see. Anything else looks like it does not exist. */
  private visibleWhere(
    auth: AuthContext,
    yearId: string | null,
  ): Prisma.StudentLeaveRequestWhereInput {
    const base: Prisma.StudentLeaveRequestWhereInput = {
      schoolId: auth.schoolId,
    };
    if (
      this.can(auth, 'student_leave.read_all') ||
      this.can(auth, 'student_leave.decide_all')
    ) {
      return base;
    }
    const or: Prisma.StudentLeaveRequestWhereInput[] = [];
    if (this.can(auth, 'student_leave.request')) {
      or.push({
        student: {
          OR: [
            { userId: auth.userId },
            { guardians: { some: { guardian: { userId: auth.userId } } } },
          ],
        },
      });
    }
    if (this.can(auth, 'student_leave.decide') && yearId) {
      or.push({
        student: {
          enrollments: {
            some: {
              academicYearId: yearId,
              division: {
                classTeachers: {
                  some: {
                    academicYearId: yearId,
                    staff: { userId: auth.userId, status: 'ACTIVE' },
                  },
                },
              },
            },
          },
        },
      });
    }
    return or.length ? { ...base, OR: or } : { ...base, id: { in: [] } };
  }

  private assertAnyAccess(auth: AuthContext) {
    const any = [
      'student_leave.request',
      'student_leave.decide',
      'student_leave.read_all',
      'student_leave.decide_all',
    ].some((p) => this.can(auth, p));
    if (!any) throw new ForbiddenException('You do not have access to this');
  }

  private placeOf(row: Row['student'], yearId: string | null): Place {
    const e = row.enrollments.find((x) => x.academicYearId === yearId);
    if (!e) return NO_PLACE;
    return {
      classId: e.division.classId,
      className: e.division.class.name,
      divisionId: e.divisionId,
      divisionName: e.division.name,
    };
  }

  /** The student's family logins: their own and their guardians'. */
  private familyUserIds(student: Row['student']): string[] {
    return [
      student.userId,
      ...student.guardians.map((g) => g.guardian.userId),
    ].filter((u): u is string => !!u);
  }

  private isFamily(auth: AuthContext, student: Row['student']): boolean {
    return (
      this.can(auth, 'student_leave.request') &&
      this.familyUserIds(student).includes(auth.userId)
    );
  }

  // ---------- the shape sent out ----------

  private async names(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  private async views(auth: AuthContext, rows: Row[], yearId: string | null) {
    const names = await this.names(
      rows.flatMap((r) => [r.requestedByUserId, r.decidedByUserId]),
    );
    const mine = await this.classTeacherDivisions(auth, yearId);
    const today = todayInIndia();
    return rows.map((r) => {
      const place = this.placeOf(r.student, yearId);
      const from = toIso(r.fromDate);
      const family = this.isFamily(auth, r.student);
      const canWithdraw =
        family &&
        (r.status === 'PENDING' || (r.status === 'APPROVED' && from > today));
      const canDecide =
        r.status === 'PENDING' &&
        (this.can(auth, 'student_leave.decide_all') ||
          (place.divisionId !== null && mine.has(place.divisionId)));
      return {
        id: r.id,
        student: {
          id: r.student.id,
          name: fullName(r.student),
          className: place.className,
          divisionName: place.divisionName,
        },
        fromDate: from,
        toDate: toIso(r.toDate),
        halfDay: r.halfDay,
        days: r.days.toNumber(),
        reason: r.reason,
        status: r.status,
        requestedBy: { name: names.get(r.requestedByUserId) ?? null },
        decidedBy: r.decidedByUserId
          ? { name: names.get(r.decidedByUserId) ?? null }
          : null,
        decidedAt: r.decidedAt,
        decisionNote: r.decisionNote,
        withdrawnAt: r.withdrawnAt,
        createdAt: r.createdAt,
        canWithdraw,
        canDecide,
      };
    });
  }

  // ---------- reading ----------

  async list(auth: AuthContext, q: ListStudentLeaveQueryDto) {
    this.assertAnyAccess(auth);
    const yearId = await this.currentYearId(auth.schoolId);
    const visible = this.visibleWhere(auth, yearId);
    const filters: Prisma.StudentLeaveRequestWhereInput[] = [];
    if (q.studentId) filters.push({ studentId: q.studentId });
    if (q.divisionId) {
      filters.push({
        student: {
          enrollments: {
            some: {
              academicYearId: yearId ?? undefined,
              divisionId: q.divisionId,
            },
          },
        },
      });
    }
    if (q.from) filters.push({ toDate: { gte: toDate(q.from) } });
    if (q.to) filters.push({ fromDate: { lte: toDate(q.to) } });
    // The counts for the status tabs ignore the status filter, like the other lists.
    const forCounts: Prisma.StudentLeaveRequestWhereInput = {
      AND: [visible, ...filters],
    };
    const where: Prisma.StudentLeaveRequestWhereInput = {
      AND: [forCounts, ...(q.status ? [{ status: q.status }] : [])],
    };
    const [rows, total, grouped] = await Promise.all([
      this.prisma.studentLeaveRequest.findMany({
        where,
        include: INCLUDE,
        // Waiting requests first, then the newest leave.
        orderBy: [
          { status: 'asc' },
          { fromDate: 'desc' },
          { createdAt: 'desc' },
        ],
        ...skipTake(q),
      }),
      this.prisma.studentLeaveRequest.count({ where }),
      this.prisma.studentLeaveRequest.groupBy({
        by: ['status'],
        where: forCounts,
        _count: { _all: true },
      }),
    ]);
    const counts = Object.fromEntries(
      STUDENT_LEAVE_STATUSES.map((s) => [s, 0]),
    ) as Record<(typeof STUDENT_LEAVE_STATUSES)[number], number>;
    for (const g of grouped) counts[g.status] = g._count._all;
    const page: Page<Awaited<ReturnType<typeof this.views>>[number]> = {
      items: await this.views(auth, rows, yearId),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
    return { ...page, counts };
  }

  private async findVisible(auth: AuthContext, id: string) {
    this.assertAnyAccess(auth);
    const yearId = await this.currentYearId(auth.schoolId);
    const row = await this.prisma.studentLeaveRequest.findFirst({
      where: { AND: [this.visibleWhere(auth, yearId), { id }] },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Leave request not found');
    return { row, yearId };
  }

  async one(auth: AuthContext, id: string) {
    const { row, yearId } = await this.findVisible(auth, id);
    return (await this.views(auth, [row], yearId))[0];
  }

  // ---------- asking ----------

  /** The student a family login is asking for: the one named, or the only one it sees. */
  private async familyStudent(auth: AuthContext, studentId?: string) {
    const students = await this.prisma.student.findMany({
      where: {
        schoolId: auth.schoolId,
        status: 'ACTIVE',
        OR: [
          { userId: auth.userId },
          { guardians: { some: { guardian: { userId: auth.userId } } } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        surname: true,
        userId: true,
        guardians: { select: { guardian: { select: { userId: true } } } },
        enrollments: INCLUDE.student.select.enrollments,
      },
    });
    if (studentId) {
      const found = students.find((s) => s.id === studentId);
      if (!found) throw new NotFoundException('Student not found');
      return found;
    }
    if (students.length === 0) throw new NotFoundException('Student not found');
    if (students.length > 1) {
      throw new BadRequestException('Say which child the leave is for');
    }
    return students[0];
  }

  /** Which academic year a request sits in: the current one, or the next if it already exists. */
  private async yearFor(schoolId: string, from: string, to: string) {
    const current = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true, startDate: true, endDate: true },
    });
    if (!current) {
      throw new BadRequestException(
        'There is no current academic year. Ask the school.',
      );
    }
    const next = await this.prisma.academicYear.findFirst({
      where: { schoolId, startDate: { gt: current.startDate } },
      orderBy: { startDate: 'asc' },
      select: { id: true, startDate: true, endDate: true },
    });
    const year = [current, next]
      .filter((y): y is NonNullable<typeof y> => !!y)
      .find((y) => toIso(y.startDate) <= from && from <= toIso(y.endDate));
    if (!year) {
      throw new BadRequestException(
        'Those days are not inside the current academic year',
      );
    }
    if (to > toIso(year.endDate)) {
      throw new BadRequestException(
        'A request must stay inside one academic year. Send one request for each year.',
      );
    }
    return year;
  }

  /** Checks a request and works out its days. Throws 400 or 409 with a sentence the family can read. */
  private async plan(
    auth: AuthContext,
    dto: {
      studentId?: string;
      fromDate: string;
      toDate?: string;
      halfDay?: boolean;
    },
  ) {
    const student = await this.familyStudent(auth, dto.studentId);
    const from = dto.fromDate;
    const to = dto.toDate ?? dto.fromDate;
    const halfDay = dto.halfDay ?? false;
    const problem = windowProblem(from, to, halfDay, todayInIndia());
    if (problem) throw new BadRequestException(problem);
    const year = await this.yearFor(auth.schoolId, from, to);
    const currentYear = await this.currentYearId(auth.schoolId);
    const place = this.placeOf(student, currentYear);
    const holidays = await studentHolidayDates(
      this.prisma,
      auth.schoolId,
      from,
      to,
      place,
    );
    const counted = countDays(from, to, halfDay, holidays);
    if (counted.days === 0) {
      throw new BadRequestException(
        'Those days are Sundays or school holidays, so there is nothing to report',
      );
    }
    return { student, from, to, halfDay, year, counted, place };
  }

  /** Another request of the same student that already covers one of these days. */
  private overlapWhere(
    studentId: string,
    from: string,
    to: string,
  ): Prisma.StudentLeaveRequestWhereInput {
    return {
      studentId,
      status: { in: ['PENDING', 'APPROVED'] },
      fromDate: { lte: toDate(to) },
      toDate: { gte: toDate(from) },
    };
  }

  private static readonly OVERLAP_MESSAGE =
    'There is already a request for some of those days';

  /** What a request would count, before it is sent. A problem is returned as a sentence, not an error. */
  async preview(auth: AuthContext, q: PreviewStudentLeaveQueryDto) {
    try {
      const p = await this.plan(auth, q);
      const overlap = await this.prisma.studentLeaveRequest.findFirst({
        where: this.overlapWhere(p.student.id, p.from, p.to),
        select: { id: true },
      });
      return {
        studentId: p.student.id,
        fromDate: p.from,
        toDate: p.to,
        halfDay: p.halfDay,
        days: p.counted.days,
        countedDates: p.counted.dates,
        skipped: p.counted.skipped,
        problem: overlap ? StudentLeaveService.OVERLAP_MESSAGE : null,
      };
    } catch (e) {
      // Wrong dates and clashes are answered as a sentence the app can show; anything else is a real error.
      if (
        e instanceof HttpException &&
        (e.getStatus() === 400 || e.getStatus() === 409)
      ) {
        return {
          studentId: q.studentId ?? null,
          fromDate: q.fromDate,
          toDate: q.toDate ?? q.fromDate,
          halfDay: q.halfDay ?? false,
          days: 0,
          countedDates: [] as string[],
          skipped: [] as { date: string; reason: 'SUNDAY' | 'HOLIDAY' }[],
          problem: e.message,
        };
      }
      throw e;
    }
  }

  async request(auth: AuthContext, dto: RequestStudentLeaveDto, ip?: string) {
    const p = await this.plan(auth, dto);
    const created = await this.prisma.$transaction(async (tx) => {
      // Two requests for one child at once must not both pass the overlap check.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student-leave:${p.student.id}`}))`;
      const clash = await tx.studentLeaveRequest.findFirst({
        where: this.overlapWhere(p.student.id, p.from, p.to),
        select: { id: true },
      });
      if (clash)
        throw new ConflictException(StudentLeaveService.OVERLAP_MESSAGE);
      return tx.studentLeaveRequest.create({
        data: {
          schoolId: auth.schoolId,
          studentId: p.student.id,
          academicYearId: p.year.id,
          fromDate: toDate(p.from),
          toDate: toDate(p.to),
          halfDay: p.halfDay,
          reason: dto.reason,
          days: p.counted.days,
          requestedByUserId: auth.userId,
        },
        include: INCLUDE,
      });
    });

    // Tell the class teacher; with none (or none with a login), the people who decide for the school.
    const teacher = await this.classTeacherUserId(
      auth.schoolId,
      p.place.divisionId,
    );
    const message = {
      type: 'student_leave.requested',
      title: `Leave request for ${p.student.firstName}`,
      body: `${range(p.from, p.to)} (${p.counted.days} ${p.counted.days === 1 ? 'day' : 'days'})`,
      link: '/app/student-leave',
    };
    if (teacher) {
      await this.notifications.notify(auth.schoolId, [teacher], message);
    } else {
      await this.notifications.notifyPermission(
        auth.schoolId,
        'student_leave.decide_all',
        message,
      );
    }
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'student_leave.requested',
      entityType: 'student_leave_request',
      entityId: created.id,
      metadata: {
        studentId: p.student.id,
        fromDate: p.from,
        toDate: p.to,
        days: p.counted.days,
      },
      ip,
    });
    return (
      await this.views(auth, [created], await this.currentYearId(auth.schoolId))
    )[0];
  }

  /** The login of the class teacher of a division this year (an active member of staff with an account). */
  private async classTeacherUserId(
    schoolId: string,
    divisionId: string | null,
  ): Promise<string | null> {
    const yearId = await this.currentYearId(schoolId);
    if (!yearId || !divisionId) return null;
    const row = await this.prisma.classTeacher.findFirst({
      where: {
        schoolId,
        academicYearId: yearId,
        divisionId,
        staff: { status: 'ACTIVE', userId: { not: null } },
      },
      select: { staff: { select: { userId: true } } },
    });
    return row?.staff.userId ?? null;
  }

  // ---------- deciding ----------

  async decide(
    auth: AuthContext,
    id: string,
    dto: DecideStudentLeaveDto,
    ip?: string,
  ) {
    const { row, yearId } = await this.findVisible(auth, id);
    const place = this.placeOf(row.student, yearId);
    const mine = await this.classTeacherDivisions(auth, yearId);
    const allowed =
      this.can(auth, 'student_leave.decide_all') ||
      (place.divisionId !== null && mine.has(place.divisionId));
    if (!allowed) {
      throw new ForbiddenException(
        'Only the class teacher or the school admin can decide this',
      );
    }
    const note = dto.note?.trim() || null;
    if (!dto.approve && !note) {
      throw new BadRequestException('Say why the leave is not approved');
    }
    // Only a waiting request can be decided; two people deciding at once cannot both win.
    const changed = await this.prisma.studentLeaveRequest.updateMany({
      where: { id, schoolId: auth.schoolId, status: 'PENDING' },
      data: {
        status: dto.approve ? 'APPROVED' : 'REFUSED',
        decidedByUserId: auth.userId,
        decidedAt: new Date(),
        decisionNote: note,
      },
    });
    if (changed.count === 0) {
      throw new ConflictException('This request has already been dealt with');
    }
    await this.notifications.notify(
      auth.schoolId,
      this.familyUserIds(row.student),
      {
        type: dto.approve ? 'student_leave.approved' : 'student_leave.refused',
        title: dto.approve ? 'Leave approved' : 'Leave not approved',
        body: [
          `${row.student.firstName}, ${range(toIso(row.fromDate), toIso(row.toDate))}`,
          note,
        ]
          .filter(Boolean)
          .join('. '),
        link: '/portal/absence',
      },
    );
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'student_leave.decided',
      entityType: 'student_leave_request',
      entityId: id,
      metadata: {
        studentId: row.student.id,
        decision: dto.approve ? 'APPROVED' : 'REFUSED',
      },
      ip,
    });
    return this.one(auth, id);
  }

  // ---------- withdrawing ----------

  /** The family takes a request back: a waiting one, or approved leave that has not started. */
  async withdraw(auth: AuthContext, id: string, ip?: string) {
    const { row, yearId } = await this.findVisible(auth, id);
    if (!this.isFamily(auth, row.student)) {
      throw new ForbiddenException('Only the family can withdraw a request');
    }
    const from = toIso(row.fromDate);
    if (row.status === 'APPROVED' && from <= todayInIndia()) {
      throw new ConflictException(
        'This leave has already started, so it cannot be withdrawn',
      );
    }
    if (row.status !== 'PENDING' && row.status !== 'APPROVED') {
      throw new ConflictException('This request cannot be withdrawn');
    }
    const wasApproved = row.status === 'APPROVED';
    const changed = await this.prisma.studentLeaveRequest.updateMany({
      where: {
        id,
        schoolId: auth.schoolId,
        status: wasApproved ? 'APPROVED' : 'PENDING',
      },
      data: { status: 'WITHDRAWN', withdrawnAt: new Date() },
    });
    if (changed.count === 0) {
      throw new ConflictException('This request has already changed');
    }
    if (wasApproved) {
      const place = this.placeOf(row.student, yearId);
      const teacher = await this.classTeacherUserId(
        auth.schoolId,
        place.divisionId,
      );
      await this.notifications.notify(auth.schoolId, [teacher], {
        type: 'student_leave.withdrawn',
        title: `Leave withdrawn for ${row.student.firstName}`,
        body: range(from, toIso(row.toDate)),
        link: '/app/student-leave',
      });
    }
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'student_leave.withdrawn',
      entityType: 'student_leave_request',
      entityId: id,
      metadata: { studentId: row.student.id, wasApproved },
      ip,
    });
    return this.one(auth, id);
  }
}
