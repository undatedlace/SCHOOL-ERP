import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { dateOnly, todayIso } from '../../common/dates.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  Status,
  addDays,
  summarise,
  tally,
  toIso,
} from '../attendance/attendance-rules.js';
import { DuesService } from '../fees/dues.service.js';
import { money2 } from '../fees/ledger.js';
import { monthsBetween } from './insights-rules.js';

/** How many academic years the yearly comparisons look back over. */
const YEARS = 5;

/**
 * Read-only numbers for the dashboard. Nothing here changes data, and every query is for the
 * signed-in person's school.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dues: DuesService,
  ) {}

  /** The latest years, oldest first, so a chart reads left to right. */
  private async recentYears(schoolId: string) {
    const years = await this.prisma.academicYear.findMany({
      where: { schoolId },
      orderBy: { startDate: 'desc' },
      take: YEARS,
    });
    return years.reverse();
  }

  // ---------- admissions ----------

  async admissions(auth: AuthContext) {
    const years = await this.recentYears(auth.schoolId);
    const ids = years.map((y) => y.id);
    const [byStatus, admitted, enrolled] = await Promise.all([
      this.prisma.application.groupBy({
        by: ['academicYearId', 'status'],
        where: { schoolId: auth.schoolId, academicYearId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.application.groupBy({
        by: ['academicYearId'],
        where: {
          schoolId: auth.schoolId,
          academicYearId: { in: ids },
          studentId: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.enrollment.groupBy({
        by: ['academicYearId'],
        where: { schoolId: auth.schoolId, academicYearId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    return {
      years: years.map((y) => {
        const own = byStatus.filter((r) => r.academicYearId === y.id);
        const n = (status: string) =>
          own.find((r) => r.status === status)?._count._all ?? 0;
        return {
          id: y.id,
          name: y.name,
          isCurrent: y.isCurrent,
          applications: own.reduce((a, r) => a + r._count._all, 0),
          received: n('RECEIVED') + n('UNDER_REVIEW'),
          granted: n('GRANTED'),
          refused: n('REFUSED'),
          withdrawn: n('WITHDRAWN'),
          /** Granted applications that have become students. */
          admitted:
            admitted.find((r) => r.academicYearId === y.id)?._count._all ?? 0,
          /** Students enrolled that year, new and continuing. */
          enrolled:
            enrolled.find((r) => r.academicYearId === y.id)?._count._all ?? 0,
        };
      }),
    };
  }

  // ---------- staff ----------

  async staff(auth: AuthContext) {
    const years = await this.recentYears(auth.schoolId);
    const rows = await Promise.all(
      years.map(async (y) => {
        const base = { schoolId: auth.schoolId };
        const [joined, left, atEnd] = await Promise.all([
          this.prisma.staff.count({
            where: { ...base, joinedOn: { gte: y.startDate, lte: y.endDate } },
          }),
          this.prisma.staff.count({
            where: { ...base, leftOn: { gte: y.startDate, lte: y.endDate } },
          }),
          this.prisma.staff.count({
            where: {
              ...base,
              joinedOn: { lte: y.endDate },
              OR: [{ leftOn: null }, { leftOn: { gt: y.endDate } }],
            },
          }),
        ]);
        return { id: y.id, name: y.name, joined, left, atYearEnd: atEnd };
      }),
    );
    const current = await this.prisma.staff.count({
      where: { schoolId: auth.schoolId, status: 'ACTIVE' },
    });
    return { years: rows, currentlyWorking: current };
  }

  // ---------- fees ----------

  async fees(auth: AuthContext, academicYearId?: string) {
    const year = academicYearId
      ? await this.prisma.academicYear.findFirst({
          where: { id: academicYearId, schoolId: auth.schoolId },
        })
      : await this.prisma.academicYear.findFirst({
          where: { schoolId: auth.schoolId, isCurrent: true },
        });
    if (!year) return null;

    const report = await this.dues.report(auth.schoolId, {
      academicYearId: year.id,
      page: 1,
      pageSize: 1,
    });
    const rows = await this.prisma.$queryRaw<
      { month: string; total: Prisma.Decimal; count: bigint }[]
    >`
      SELECT to_char(p.paid_on, 'YYYY-MM') AS month, SUM(p.amount) AS total, COUNT(*) AS count
      FROM payments p
      WHERE p.school_id = ${auth.schoolId}::uuid
        AND p.paid_on BETWEEN ${year.startDate} AND ${year.endDate}
        AND NOT EXISTS (SELECT 1 FROM payment_reversals r WHERE r.payment_id = p.id)
      GROUP BY 1`;
    const by = new Map(rows.map((r) => [r.month, r]));
    return {
      academicYear: { id: year.id, name: year.name },
      totals: report.totals,
      byClass: report.byClass,
      byDivision: report.byDivision,
      /** Money received in each month of the year (payments that were not reversed). */
      collectedByMonth: monthsBetween(
        toIso(year.startDate),
        toIso(year.endDate),
      ).map((month) => ({
        month,
        total: money2(by.get(month)?.total ?? 0),
        payments: Number(by.get(month)?.count ?? 0),
      })),
    };
  }

  // ---------- attendance ----------

  /** The divisions this person may look at: all of them, or the ones they teach. */
  private async divisionsFor(auth: AuthContext) {
    if (auth.permissions.includes('attendance.read_all')) {
      return this.prisma.division.findMany({
        where: { schoolId: auth.schoolId },
        select: {
          id: true,
          name: true,
          class: { select: { name: true, sortOrder: true } },
        },
      });
    }
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId: auth.schoolId, isCurrent: true },
      select: { id: true },
    });
    if (!year) return [];
    const teacher = {
      academicYearId: year.id,
      staff: { userId: auth.userId, status: 'ACTIVE' as const },
    };
    return this.prisma.division.findMany({
      where: {
        schoolId: auth.schoolId,
        OR: [
          { classTeachers: { some: teacher } },
          { subjectTeachers: { some: teacher } },
        ],
      },
      select: {
        id: true,
        name: true,
        class: { select: { name: true, sortOrder: true } },
      },
    });
  }

  async attendance(auth: AuthContext, days: number) {
    const divisions = await this.divisionsFor(auth);
    const ids = divisions.map((d) => d.id);
    const to = todayIso();
    const from = addDays(to, -(days - 1));
    const range = { gte: dateOnly(from), lte: dateOnly(to) };
    const where = {
      schoolId: auth.schoolId,
      divisionId: { in: ids },
      date: range,
    };

    const [daily, perDivision, markedToday] = await Promise.all([
      this.prisma.attendanceRecord.groupBy({
        by: ['date', 'status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ['divisionId', 'status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ['divisionId'],
        where: { ...where, date: dateOnly(to) },
      }),
    ]);

    const countsOf = (rows: { status: string; _count: { _all: number } }[]) =>
      summarise(
        tally(
          rows.flatMap((r) =>
            Array<Status>(r._count._all).fill(r.status as Status),
          ),
        ),
      );
    const dates = [...new Set(daily.map((r) => toIso(r.date)))].sort();
    return {
      from,
      to,
      days,
      today: { divisions: ids.length, marked: markedToday.length },
      trend: dates.map((date) => {
        const s = countsOf(daily.filter((r) => toIso(r.date) === date));
        return {
          date,
          percent: s.percent,
          present: s.present,
          late: s.late,
          absent: s.absent,
          onLeave: s.onLeave,
        };
      }),
      /** Each division's attendance over the period, lowest first. */
      divisions: divisions
        .map((d) => {
          const s = countsOf(perDivision.filter((r) => r.divisionId === d.id));
          return {
            id: d.id,
            label: `${d.class.name}-${d.name}`,
            sortOrder: d.class.sortOrder,
            percent: s.percent,
            markedDays: s.markedDays,
          };
        })
        .filter((d) => d.percent !== null)
        .sort(
          (a, b) =>
            (a.percent ?? 0) - (b.percent ?? 0) || a.sortOrder - b.sortOrder,
        )
        .map(({ sortOrder: _unused, ...rest }) => rest),
    };
  }
}
