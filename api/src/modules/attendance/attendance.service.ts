import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StudentsService } from '../students/students.service.js';
import {
  Counts,
  MAX_RANGE_DAYS,
  Status,
  TEACHER_EDIT_DAYS,
  daysBetween,
  emptyCounts,
  isIsoDate,
  summarise,
  tally,
  todayInIndia,
  toDate,
  toIso,
} from './attendance-rules.js';
import { MarkAttendanceDto } from './dto/attendance.dto.js';

type Mode = 'read' | 'mark';

const fullName = (s: { firstName: string; surname: string }) =>
  `${s.firstName} ${s.surname}`;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentsService,
    private readonly audit: AuditService,
  ) {}

  // ---------- who may work on which division ----------

  private can(auth: AuthContext, permission: string) {
    return auth.permissions.includes(permission);
  }

  /** Divisions the signed-in teacher teaches (class teacher or subject teacher) in a year. */
  private async taughtDivisionIds(
    auth: AuthContext,
    academicYearId: string,
  ): Promise<Set<string>> {
    const where = {
      schoolId: auth.schoolId,
      academicYearId,
      staff: { userId: auth.userId, status: 'ACTIVE' as const },
    };
    const [asClass, asSubject] = await Promise.all([
      this.prisma.classTeacher.findMany({
        where,
        select: { divisionId: true },
      }),
      this.prisma.subjectTeacher.findMany({
        where,
        select: { divisionId: true },
      }),
    ]);
    return new Set([...asClass, ...asSubject].map((r) => r.divisionId));
  }

  /** Throws 404 (the same as "does not exist") unless this user may use the division. */
  private async assertDivision(
    auth: AuthContext,
    divisionId: string,
    academicYearId: string,
    mode: Mode,
  ) {
    const division = await this.prisma.division.findFirst({
      where: { id: divisionId, schoolId: auth.schoolId },
      select: {
        id: true,
        name: true,
        class: { select: { id: true, name: true } },
      },
    });
    if (!division) throw new NotFoundException('Division not found');
    const wide = this.can(
      auth,
      mode === 'mark' ? 'attendance.mark_all' : 'attendance.read_all',
    );
    if (!wide) {
      const taught = await this.taughtDivisionIds(auth, academicYearId);
      if (!taught.has(divisionId))
        throw new NotFoundException('Division not found');
    }
    return division;
  }

  // ---------- dates ----------

  private day(value: string | undefined, name = 'date'): string {
    const iso = value ?? todayInIndia();
    if (!isIsoDate(iso))
      throw new BadRequestException(`${name} is not a real date`);
    return iso;
  }

  /** The academic year a date falls in. */
  private async yearOn(schoolId: string, iso: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: {
        schoolId,
        startDate: { lte: toDate(iso) },
        endDate: { gte: toDate(iso) },
      },
      // Years should not overlap; if they ever do, the current one wins.
      orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
      select: { id: true, name: true, startDate: true },
    });
    if (!year) {
      throw new BadRequestException(
        'That date is not inside any academic year. Set the year up in Academic setup.',
      );
    }
    return year;
  }

  private async range(auth: AuthContext, q: { from?: string; to?: string }) {
    const to = this.day(q.to, 'to');
    const year = await this.yearOn(auth.schoolId, to);
    const from = this.day(q.from ?? toIso(year.startDate), 'from');
    if (from > to) throw new BadRequestException('from must not be after to');
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Choose a range of at most ${MAX_RANGE_DAYS} days`,
      );
    }
    return { from, to, year };
  }

  /** Whether this person may still mark or correct a day. */
  private editable(auth: AuthContext, iso: string, today: string): boolean {
    if (iso > today) return false;
    if (this.can(auth, 'attendance.mark_all')) return true;
    return daysBetween(iso, today) <= TEACHER_EDIT_DAYS;
  }

  // ---------- who is in a division on a day ----------

  private enrolledOn(divisionId: string, academicYearId: string, iso: string) {
    const date = toDate(iso);
    return this.prisma.enrollment.findMany({
      where: {
        divisionId,
        academicYearId,
        startedOn: { lte: date },
        OR: [{ endedOn: null }, { endedOn: { gte: date } }],
        student: { OR: [{ status: 'ACTIVE' }, { leftOn: { gte: date } }] },
      },
      select: {
        rollNo: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            surname: true,
          },
        },
      },
    });
  }

  private sortRoster<T extends { rollNo: number | null; name: string }>(
    rows: T[],
  ) {
    return rows.sort(
      (a, b) =>
        (a.rollNo ?? Number.MAX_SAFE_INTEGER) -
          (b.rollNo ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name),
    );
  }

  // ---------- the divisions a person can work on ----------

  async divisions(auth: AuthContext) {
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId: auth.schoolId, isCurrent: true },
      select: { id: true },
    });
    if (!year) return [];
    const wide = this.can(auth, 'attendance.read_all');
    const taught = await this.taughtDivisionIds(auth, year.id);
    const rows = await this.prisma.division.findMany({
      where: {
        schoolId: auth.schoolId,
        ...(wide ? {} : { id: { in: [...taught] } }),
      },
      select: {
        id: true,
        name: true,
        class: { select: { id: true, name: true, sortOrder: true } },
      },
    });
    const markAll = this.can(auth, 'attendance.mark_all');
    const mark = this.can(auth, 'attendance.mark');
    return rows
      .sort(
        (a, b) =>
          a.class.sortOrder - b.class.sortOrder || a.name.localeCompare(b.name),
      )
      .map((d) => ({
        id: d.id,
        name: d.name,
        class: { id: d.class.id, name: d.class.name },
        canMark: mark && (markAll || taught.has(d.id)),
      }));
  }

  // ---------- one division on one day ----------

  async roster(auth: AuthContext, divisionId: string, dateIso?: string) {
    const iso = this.day(dateIso);
    const year = await this.yearOn(auth.schoolId, iso);
    const division = await this.assertDivision(
      auth,
      divisionId,
      year.id,
      'read',
    );

    const [enrolled, records] = await Promise.all([
      this.enrolledOn(divisionId, year.id, iso),
      this.prisma.attendanceRecord.findMany({
        where: { schoolId: auth.schoolId, divisionId, date: toDate(iso) },
        include: { markedBy: { select: { fullName: true } } },
      }),
    ]);
    const byStudent = new Map(records.map((r) => [r.studentId, r]));
    const students = this.sortRoster(
      enrolled.map((e) => {
        const r = byStudent.get(e.student.id);
        return {
          studentId: e.student.id,
          admissionNo: e.student.admissionNo,
          name: fullName(e.student),
          rollNo: e.rollNo,
          status: (r?.status ?? null) as Status | null,
          note: r?.note ?? null,
        };
      }),
    );
    const latest = records.reduce<(typeof records)[number] | null>(
      (best, r) => (!best || r.updatedAt > best.updatedAt ? r : best),
      null,
    );
    const today = todayInIndia();
    const canMark =
      this.can(auth, 'attendance.mark') &&
      this.editable(auth, iso, today) &&
      (await this.mayMark(auth, divisionId, year.id));
    return {
      date: iso,
      academicYear: { id: year.id, name: year.name },
      division: { id: division.id, name: division.name, class: division.class },
      canMark,
      marked: records.length > 0,
      markedBy: latest?.markedBy.fullName ?? null,
      markedAt: latest?.updatedAt ?? null,
      counts: summarise(
        tally(students.flatMap((s) => (s.status ? [s.status] : []))),
      ),
      students,
    };
  }

  private async mayMark(auth: AuthContext, divisionId: string, yearId: string) {
    if (this.can(auth, 'attendance.mark_all')) return true;
    return (await this.taughtDivisionIds(auth, yearId)).has(divisionId);
  }

  /** Saves a day's attendance for the students sent. Sending a student again changes their mark. */
  async mark(auth: AuthContext, divisionId: string, dto: MarkAttendanceDto) {
    const iso = this.day(dto.date);
    const today = todayInIndia();
    if (iso > today) {
      throw new BadRequestException(
        'Attendance cannot be marked for a future date',
      );
    }
    const year = await this.yearOn(auth.schoolId, iso);
    await this.assertDivision(auth, divisionId, year.id, 'mark');
    if (!this.editable(auth, iso, today)) {
      throw new ForbiddenException(
        `Attendance older than ${TEACHER_EDIT_DAYS} days can only be changed by the school admin`,
      );
    }

    const ids = dto.entries.map((e) => e.studentId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('A student appears more than once');
    }
    const enrolled = await this.enrolledOn(divisionId, year.id, iso);
    const allowed = new Set(enrolled.map((e) => e.student.id));
    const stranger = ids.find((id) => !allowed.has(id));
    if (stranger) {
      throw new BadRequestException(
        'Some students are not in this division on that date',
      );
    }

    await this.prisma.$transaction(
      dto.entries.map((e) =>
        this.prisma.attendanceRecord.upsert({
          where: {
            studentId_date: { studentId: e.studentId, date: toDate(iso) },
          },
          create: {
            schoolId: auth.schoolId,
            academicYearId: year.id,
            divisionId,
            studentId: e.studentId,
            date: toDate(iso),
            status: e.status,
            note: e.note || null,
            markedById: auth.userId,
          },
          update: {
            divisionId,
            status: e.status,
            note: e.note || null,
            markedById: auth.userId,
          },
        }),
      ),
    );
    return this.roster(auth, divisionId, iso);
  }

  /** Removes one student's mark for a day (the admin only; a teacher changes a mark instead). */
  async clear(
    auth: AuthContext,
    divisionId: string,
    studentId: string,
    dateIso: string | undefined,
    ip?: string,
  ) {
    if (!dateIso)
      throw new BadRequestException('Say which date (date=YYYY-MM-DD)');
    const iso = this.day(dateIso);
    if (iso > todayInIndia()) {
      throw new BadRequestException('There is no attendance for a future date');
    }
    const year = await this.yearOn(auth.schoolId, iso);
    await this.assertDivision(auth, divisionId, year.id, 'mark');
    const record = await this.prisma.attendanceRecord.findFirst({
      where: {
        schoolId: auth.schoolId,
        divisionId,
        studentId,
        date: toDate(iso),
      },
      select: { id: true, status: true },
    });
    if (!record) throw new NotFoundException('There is no mark to remove');
    await this.prisma.attendanceRecord.delete({ where: { id: record.id } });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'attendance.mark_removed',
      entityType: 'student',
      entityId: studentId,
      metadata: { date: iso, was: record.status, divisionId },
      ip,
    });
    return this.roster(auth, divisionId, iso);
  }

  // ---------- reports ----------

  /** Each student of a division with their totals over a range. */
  async divisionReport(
    auth: AuthContext,
    divisionId: string,
    q: { from?: string; to?: string },
  ) {
    const { from, to, year } = await this.range(auth, q);
    const division = await this.assertDivision(
      auth,
      divisionId,
      year.id,
      'read',
    );
    const enrolled = await this.enrolledOn(divisionId, year.id, to);
    const ids = enrolled.map((e) => e.student.id);
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        schoolId: auth.schoolId,
        studentId: { in: ids },
        date: { gte: toDate(from), lte: toDate(to) },
      },
      select: { studentId: true, status: true, date: true },
    });
    const perStudent = new Map<string, Status[]>();
    /** Each student's status on each marked day, for the grid. */
    const byDay = new Map<string, Record<string, Status>>();
    for (const r of records) {
      const list = perStudent.get(r.studentId) ?? [];
      list.push(r.status);
      perStudent.set(r.studentId, list);
      const days = byDay.get(r.studentId) ?? {};
      days[toIso(r.date)] = r.status;
      byDay.set(r.studentId, days);
    }
    const days = new Set(records.map((r) => toIso(r.date)));
    const students = this.sortRoster(
      enrolled.map((e) => ({
        studentId: e.student.id,
        admissionNo: e.student.admissionNo,
        name: fullName(e.student),
        rollNo: e.rollNo,
        ...summarise(tally(perStudent.get(e.student.id) ?? [])),
        days: byDay.get(e.student.id) ?? {},
      })),
    );
    return {
      from,
      to,
      /** The days any attendance was taken for this division, oldest first. */
      markedDates: [...days].sort(),
      academicYear: { id: year.id, name: year.name },
      division: { id: division.id, name: division.name, class: division.class },
      daysMarked: days.size,
      students,
    };
  }

  /** One student's days and totals. Parents and students reach only their own. */
  async studentHistory(
    auth: AuthContext,
    studentId: string,
    q: { from?: string; to?: string },
  ) {
    await this.students.assertVisible(auth, studentId);
    const { from, to } = await this.range(auth, q);
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        schoolId: auth.schoolId,
        studentId,
        date: { gte: toDate(from), lte: toDate(to) },
      },
      orderBy: { date: 'desc' },
      select: { date: true, status: true, note: true },
    });
    return {
      studentId,
      from,
      to,
      summary: summarise(tally(records.map((r) => r.status))),
      records: records.map((r) => ({
        date: toIso(r.date),
        status: r.status as Status,
        note: r.note,
      })),
    };
  }

  /** For one day: which divisions have been marked, and the totals. */
  async overview(auth: AuthContext, dateIso?: string) {
    const iso = this.day(dateIso);
    const year = await this.yearOn(auth.schoolId, iso);
    const wide = this.can(auth, 'attendance.read_all');
    const taught = await this.taughtDivisionIds(auth, year.id);
    const divisions = await this.prisma.division.findMany({
      where: {
        schoolId: auth.schoolId,
        ...(wide ? {} : { id: { in: [...taught] } }),
      },
      select: {
        id: true,
        name: true,
        class: { select: { id: true, name: true, sortOrder: true } },
      },
    });
    const ids = divisions.map((d) => d.id);
    const date = toDate(iso);
    const [enrolled, grouped] = await Promise.all([
      this.prisma.enrollment.groupBy({
        by: ['divisionId'],
        where: {
          divisionId: { in: ids },
          academicYearId: year.id,
          startedOn: { lte: date },
          OR: [{ endedOn: null }, { endedOn: { gte: date } }],
          student: { OR: [{ status: 'ACTIVE' }, { leftOn: { gte: date } }] },
        },
        _count: { _all: true },
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ['divisionId', 'status'],
        where: { schoolId: auth.schoolId, divisionId: { in: ids }, date },
        _count: { _all: true },
      }),
    ]);
    const enrolledBy = new Map(
      enrolled.map((e) => [e.divisionId, e._count._all]),
    );
    const countsBy = new Map<string, Counts>();
    for (const g of grouped) {
      const c = countsBy.get(g.divisionId) ?? emptyCounts();
      if (g.status === 'PRESENT') c.present = g._count._all;
      else if (g.status === 'ABSENT') c.absent = g._count._all;
      else if (g.status === 'LATE') c.late = g._count._all;
      else c.onLeave = g._count._all;
      countsBy.set(g.divisionId, c);
    }
    return {
      date: iso,
      divisions: divisions
        .sort(
          (a, b) =>
            a.class.sortOrder - b.class.sortOrder ||
            a.name.localeCompare(b.name),
        )
        .map((d) => {
          const counts = countsBy.get(d.id) ?? emptyCounts();
          const summary = summarise(counts);
          return {
            id: d.id,
            name: d.name,
            class: { id: d.class.id, name: d.class.name },
            enrolled: enrolledBy.get(d.id) ?? 0,
            marked: summary.markedDays,
            counts,
            done: summary.markedDays > 0,
          };
        }),
    };
  }
}
