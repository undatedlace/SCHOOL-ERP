import { Injectable } from '@nestjs/common';
import { todayIso } from '../../common/dates.js';
import { skipTake } from '../../common/dto/page-query.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { DuesQueryDto } from './dto/fees.dto.js';
import { invoiceTotals } from './invoice-totals.js';
import { fromPaise, netInstalments, toPaise, waterfall } from './ledger.js';

interface Sums {
  billed: number;
  collected: number;
  pending: number;
  overdue: number;
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
    const perStudent = new Map<string, Sums & { previous: number }>();
    for (const t of totals) {
      const s = perStudent.get(t.studentId) ?? { ...zero(), previous: 0 };
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
      s.billed += t.gross - t.concessions;
      s.collected += t.paid;
      s.pending += t.pending;
      s.overdue += overdue;
      if (t.academicYearId !== yearId) s.previous += t.pending;
      perStudent.set(t.studentId, s);
    }

    const students = enrolments
      .map((e) => {
        const s = perStudent.get(e.student.id) ?? { ...zero(), previous: 0 };
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
          sums: s,
        };
      })
      .filter((r) => !q.onlyOwing || r.sums.pending > 0);

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

    return {
      academicYearId: yearId,
      totals: {
        students: students.length,
        owing: students.filter((s) => s.sums.pending > 0).length,
        ...out(grand),
      },
      byClass: groups(classes),
      byDivision: groups(divisions),
      students: {
        items: pageItems.map((r) => ({
          studentId: r.studentId,
          admissionNo: r.admissionNo,
          fullName: r.fullName,
          class: r.class,
          division: r.division,
          ...out(r.sums),
          previousYearsPending: fromPaise(r.sums.previous),
        })),
        total: students.length,
        page: q.page,
        pageSize: q.pageSize,
      },
    };
  }

  private empty(q: DuesQueryDto) {
    return {
      academicYearId: null,
      totals: { students: 0, owing: 0, ...out(zero()) },
      byClass: [],
      byDivision: [],
      students: { items: [], total: 0, page: q.page, pageSize: q.pageSize },
    };
  }
}
