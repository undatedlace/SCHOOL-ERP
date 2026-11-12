import { Injectable } from '@nestjs/common';
import { todayIso } from '../../common/dates.js';
import { skipTake } from '../../common/dto/page-query.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { DuesQueryDto, DuesStatus } from './dto/fees.dto.js';
import { invoiceTotals } from './invoice-totals.js';
import { fromPaise, netInstalments, toPaise, waterfall } from './ledger.js';

interface Sums {
  billed: number;
  collected: number;
  pending: number;
  overdue: number;
}
/** Students listed in "longest overdue". */
const LONGEST_OVERDUE = 6;

/**
 * One word for where a student stands: nothing billed, all paid, overdue (some of what is due has
 * passed its date), part paid, or nothing paid yet. Overdue wins over the other two owing states.
 */
export function duesStatus(s: Sums): DuesStatus {
  if (s.billed <= 0 && s.pending <= 0) return 'NONE';
  if (s.pending <= 0) return 'PAID';
  if (s.overdue > 0) return 'OVERDUE';
  return s.collected > 0 ? 'PARTIAL' : 'UNPAID';
}

const zero = (): Sums => ({ billed: 0, collected: 0, pending: 0, overdue: 0 });
const add = (a: Sums, b: Sums) => {
  a.billed += b.billed;
  a.collected += b.collected;
  a.pending += b.pending;
  a.overdue += b.overdue;
};
const out = (s: Sums) => ({
  billed: fromPaise(s.billed),
  collected: fromPaise(s.collected),
  pending: fromPaise(s.pending),
  overdue: fromPaise(s.overdue),
});

/**
 * Who owes what. For the students enrolled in a year, it adds up everything they owe across
 * all years, so dues from earlier years stay visible after promotion. "Overdue" is the part
 * of the pending amount whose instalment date has passed.
 */
@Injectable()
export class DuesService {
  constructor(private readonly prisma: PrismaService) {}

  async report(schoolId: string, q: DuesQueryDto) {
    const yearId =
      q.academicYearId ??
      (
        await this.prisma.academicYear.findFirst({
          where: { schoolId, isCurrent: true },
          select: { id: true },
        })
      )?.id;
    if (!yearId) return this.empty(q);

    const enrolments = await this.prisma.enrollment.findMany({
      where: {
        schoolId,
        academicYearId: yearId,
        student: {
          status: 'ACTIVE',
          ...(q.search
            ? {
                OR: [
                  { firstName: { contains: q.search, mode: 'insensitive' } },
                  { surname: { contains: q.search, mode: 'insensitive' } },
                  { admissionNo: { contains: q.search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        ...(q.divisionId ? { divisionId: q.divisionId } : {}),
        ...(q.classId ? { division: { classId: q.classId } } : {}),
      },
      select: {
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            fatherName: true,
            surname: true,
            gender: true,
          },
        },
        division: {
          select: {
            id: true,
            name: true,
            class: { select: { id: true, name: true, sortOrder: true } },
          },
        },
      },
    });
    const studentIds = enrolments.map((e) => e.student.id);

    const totals = await invoiceTotals(this.prisma, schoolId, { studentIds });
    const instalments = totals.length
      ? await this.prisma.feeInstalment.findMany({
          where: { invoiceId: { in: totals.map((t) => t.invoiceId) } },
          orderBy: [{ invoiceId: 'asc' }, { seq: 'asc' }],
          select: { invoiceId: true, dueDate: true, amount: true },
        })
      : [];
    const byInvoice = new Map<string, { dueDate: string; amount: number }[]>();
    for (const i of instalments) {
      const list = byInvoice.get(i.invoiceId) ?? [];
      list.push({
        dueDate: i.dueDate.toISOString().slice(0, 10),
        amount: toPaise(i.amount.toString()),
      });
      byInvoice.set(i.invoiceId, list);
    }

    const today = todayIso();
    type PerStudent = Sums & {
      previous: number;
      /** The oldest instalment date still unpaid and passed. */
      oldestOverdueOn: string | null;
      /** The next instalment date still unpaid and not yet passed. */
      nextDueOn: string | null;
    };
    const blank = (): PerStudent => ({
      ...zero(),
      previous: 0,
      oldestOverdueOn: null,
      nextDueOn: null,
    });
    const perStudent = new Map<string, PerStudent>();
    for (const t of totals) {
      const s = perStudent.get(t.studentId) ?? blank();
      const parts = byInvoice.get(t.invoiceId) ?? [];
      const status = waterfall(
        netInstalments(
          parts.map((p) => p.amount),
          t.concessions,
        ),
        t.paid,
      );
      const overdue = status.reduce(
        (a, st, n) => a + (parts[n].dueDate < today ? st.pending : 0),
        0,
      );
      status.forEach((st, n) => {
        if (st.pending <= 0) return;
        const d = parts[n].dueDate;
        if (d < today) {
          if (!s.oldestOverdueOn || d < s.oldestOverdueOn)
            s.oldestOverdueOn = d;
        } else if (!s.nextDueOn || d < s.nextDueOn) s.nextDueOn = d;
      });
      s.billed += t.gross - t.concessions;
      s.collected += t.paid;
      s.pending += t.pending;
      s.overdue += overdue;
      if (t.academicYearId !== yearId) s.previous += t.pending;
      perStudent.set(t.studentId, s);
    }

    const pool = enrolments
      .map((e) => {
        const s = perStudent.get(e.student.id) ?? blank();
        return {
          studentId: e.student.id,
          admissionNo: e.student.admissionNo,
          fullName: [
            e.student.firstName,
            e.student.fatherName,
            e.student.surname,
          ]
            .filter(Boolean)
            .join(' '),
          class: e.division.class.name,
          division: e.division.name,
          classId: e.division.class.id,
          divisionId: e.division.id,
          sortOrder: e.division.class.sortOrder,
          gender: e.student.gender,
          sums: s,
          status: duesStatus(s),
        };
      })
      .filter((r) => !q.onlyOwing || r.sums.pending > 0);

    // Boys and girls side by side, for whatever else is chosen (the gender filter aside).
    const genderSums = new Map<
      string,
      { students: number; owing: number; sums: Sums }
    >();
    for (const r of pool) {
      const g = genderSums.get(r.gender) ?? {
        students: 0,
        owing: 0,
        sums: zero(),
      };
      g.students++;
      if (r.sums.pending > 0) g.owing++;
      add(g.sums, r.sums);
      genderSums.set(r.gender, g);
    }
    const byGender = ['MALE', 'FEMALE', 'OTHER']
      .filter((g) => genderSums.has(g))
      .map((g) => {
        const v = genderSums.get(g)!;
        return {
          gender: g,
          students: v.students,
          owing: v.owing,
          ...out(v.sums),
        };
      });
    const everyone = q.gender
      ? pool.filter((r) => r.gender === q.gender)
      : pool;

    // Counts per status are taken before the status filter, so every tab shows its number.
    const counts: Record<DuesStatus, number> = {
      PAID: 0,
      PARTIAL: 0,
      UNPAID: 0,
      OVERDUE: 0,
      NONE: 0,
    };
    for (const r of everyone) counts[r.status]++;
    const longestOverdue = everyone
      .filter((r) => r.sums.oldestOverdueOn)
      .sort(
        (a, b) =>
          a.sums.oldestOverdueOn!.localeCompare(b.sums.oldestOverdueOn!) ||
          b.sums.overdue - a.sums.overdue,
      )
      .slice(0, LONGEST_OVERDUE);
    const students = q.status
      ? everyone.filter((r) => r.status === q.status)
      : everyone;

    const grand = zero();
    const divisions = new Map<
      string,
      {
        label: string;
        sortOrder: number;
        students: number;
        owing: number;
        sums: Sums;
      }
    >();
    const classes = new Map<
      string,
      {
        label: string;
        sortOrder: number;
        students: number;
        owing: number;
        sums: Sums;
      }
    >();
    for (const r of students) {
      add(grand, r.sums);
      for (const [map, key, label] of [
        [divisions, r.divisionId, `${r.class}-${r.division}`],
        [classes, r.classId, r.class],
      ] as const) {
        const g = map.get(key) ?? {
          label,
          sortOrder: r.sortOrder,
          students: 0,
          owing: 0,
          sums: zero(),
        };
        g.students++;
        if (r.sums.pending > 0) g.owing++;
        add(g.sums, r.sums);
        map.set(key, g);
      }
    }
    const groups = (m: typeof divisions) =>
      [...m.entries()]
        .sort(
          ([, a], [, b]) =>
            a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
        )
        .map(([id, g]) => ({
          id,
          label: g.label,
          students: g.students,
          owing: g.owing,
          ...out(g.sums),
        }));

    students.sort(
      (a, b) =>
        b.sums.pending - a.sums.pending || a.fullName.localeCompare(b.fullName),
    );
    const pageItems = students.slice(
      skipTake(q).skip,
      skipTake(q).skip + q.pageSize,
    );

    const shown = [...pageItems, ...longestOverdue].map((r) => r.studentId);
    const lastPaid = new Map(
      shown.length
        ? (
            await this.prisma.payment.groupBy({
              by: ['studentId'],
              where: { schoolId, studentId: { in: shown }, reversal: null },
              _max: { paidOn: true },
            })
          ).map((g) => [
            g.studentId,
            g._max.paidOn?.toISOString().slice(0, 10) ?? null,
          ])
        : [],
    );
    const row = (r: (typeof everyone)[number]) => ({
      studentId: r.studentId,
      admissionNo: r.admissionNo,
      fullName: r.fullName,
      class: r.class,
      division: r.division,
      ...out(r.sums),
      previousYearsPending: fromPaise(r.sums.previous),
      status: r.status,
      oldestOverdueOn: r.sums.oldestOverdueOn,
      nextDueOn: r.sums.nextDueOn,
      lastPaidOn: lastPaid.get(r.studentId) ?? null,
    });

    return {
      academicYearId: yearId,
      counts,
      byGender,
      longestOverdue: longestOverdue.map(row),
      totals: {
        students: students.length,
        owing: students.filter((s) => s.sums.pending > 0).length,
        ...out(grand),
      },
      byClass: groups(classes),
      byDivision: groups(divisions),
      students: {
        items: pageItems.map(row),
        total: students.length,
        page: q.page,
        pageSize: q.pageSize,
      },
    };
  }

  private empty(q: DuesQueryDto) {
    return {
      academicYearId: null,
      counts: { PAID: 0, PARTIAL: 0, UNPAID: 0, OVERDUE: 0, NONE: 0 },
      byGender: [],
      longestOverdue: [],
      totals: { students: 0, owing: 0, ...out(zero()) },
      byClass: [],
      byDivision: [],
      students: { items: [], total: 0, page: q.page, pageSize: q.pageSize },
    };
  }
}
