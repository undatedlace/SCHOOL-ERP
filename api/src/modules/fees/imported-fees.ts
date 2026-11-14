import { BadRequestException } from '@nestjs/common';
import { dateOnly, todayIso } from '../../common/dates.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PaymentMode } from '../../generated/prisma/enums.js';
import { invoiceTotals } from './invoice-totals.js';
import { fromPaise, toPaise } from './ledger.js';

/** One student's year as brought in from Excel: what was billed and what had been paid. */
export interface ImportedYearFees {
  studentId: string;
  academicYearId: string;
  /** Rupees as text ("12500.00"): the year's fees after any concession. */
  billed: string;
  /** Rupees as text; "0.00" when nothing was paid. */
  paid: string;
  /** The date of the last payment (the imported total is recorded on that day). */
  paidOn: string | null;
  mode: PaymentMode;
  reference: string | null;
  note: string | null;
}

/** What the student already has for that year, for the check and to stay safe on a second run. */
export interface YearFeesNow {
  invoiceId: string | null;
  /** Billed less concessions, in paise. */
  billed: number;
  paid: number;
}

type Tx = Prisma.TransactionClient;

export async function yearFeesNow(
  db: Pick<Tx, '$queryRaw' | 'feeInvoice'>,
  schoolId: string,
  studentIds: string[],
  academicYearId: string,
): Promise<Map<string, YearFeesNow>> {
  const invoices = await db.feeInvoice.findMany({
    where: {
      schoolId,
      academicYearId,
      kind: 'FEE_STRUCTURE',
      studentId: { in: studentIds },
    },
    select: { id: true, studentId: true },
  });
  const totals = new Map(
    (
      await invoiceTotals(db, schoolId, {
        invoiceIds: invoices.map((i) => i.id),
      })
    ).map((t) => [t.invoiceId, t]),
  );
  return new Map(
    invoices.map((i) => {
      const t = totals.get(i.id);
      return [
        i.studentId,
        {
          invoiceId: i.id,
          billed: t ? t.gross - t.concessions : 0,
          paid: t ? t.paid : 0,
        },
      ];
    }),
  );
}

/**
 * What an imported row would do to what is there now. Shared by the check and the import, so a
 * second run of the same file changes nothing, and money is never recorded twice.
 */
export function planYearFees(
  row: { billed: number; paid: number },
  now: YearFeesNow | undefined,
): { error?: string; unchanged?: boolean; bill: boolean; pay: number } {
  if (row.paid > row.billed)
    return { error: 'Paid is more than billed', bill: false, pay: 0 };
  if (!now?.invoiceId) {
    if (row.billed <= 0)
      return { error: 'Billed must be more than zero', bill: false, pay: 0 };
    return { bill: true, pay: row.paid };
  }
  if (row.billed !== now.billed) {
    return {
      error: `This year is already billed at ₹${fromPaise(now.billed)}. Change it on the student's page (a concession), not here.`,
      bill: false,
      pay: 0,
    };
  }
  if (row.paid === now.paid) return { unchanged: true, bill: false, pay: 0 };
  if (now.paid > 0) {
    return {
      error: `₹${fromPaise(now.paid)} is already recorded as paid for this year. Record further payments on the student's page.`,
      bill: false,
      pay: 0,
    };
  }
  return { bill: false, pay: row.paid };
}

/**
 * Writes one student's year: the bill (one line, one instalment) if there is none yet, and the
 * money paid so far as one payment allocated to it, in the receipt series of the year it was
 * paid in. Takes the same locks as recording a payment, so it cannot race a cashier.
 */
export async function writeYearFees(
  tx: Tx,
  ctx: { schoolId: string; userId: string; batchId: string },
  row: ImportedYearFees,
): Promise<{ invoiceId: string; paymentId: string | null }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fees-student:${row.studentId}`}))`;
  const now = (
    await yearFeesNow(tx, ctx.schoolId, [row.studentId], row.academicYearId)
  ).get(row.studentId);
  const billed = toPaise(row.billed);
  const paid = toPaise(row.paid);
  const plan = planYearFees({ billed, paid }, now);
  if (plan.error) throw new BadRequestException(plan.error);
  if (plan.unchanged)
    throw new BadRequestException(
      'Nothing to change: this is already recorded',
    );

  const year = await tx.academicYear.findFirstOrThrow({
    where: { id: row.academicYearId, schoolId: ctx.schoolId },
    select: { id: true, startDate: true },
  });
  let invoiceId = now?.invoiceId ?? null;
  if (plan.bill) {
    // The first due date of the class's fees for that year, if the school set them up; else the year's first day.
    const enrolment = await tx.enrollment.findFirst({
      where: { studentId: row.studentId, academicYearId: year.id },
      select: { division: { select: { classId: true } } },
    });
    const structure = enrolment
      ? await tx.feeStructure.findFirst({
          where: {
            academicYearId: year.id,
            classId: enrolment.division.classId,
          },
          select: {
            instalments: {
              orderBy: { seq: 'asc' },
              take: 1,
              select: { dueDate: true },
            },
          },
        })
      : null;
    const dueDate = structure?.instalments[0]?.dueDate ?? year.startDate;
    const invoice = await tx.feeInvoice.create({
      data: {
        schoolId: ctx.schoolId,
        studentId: row.studentId,
        academicYearId: year.id,
        kind: 'FEE_STRUCTURE',
        note: 'Imported from Excel',
        importBatchId: ctx.batchId,
        createdById: ctx.userId,
        lines: {
          create: [
            {
              description: 'Fees billed (imported)',
              amount: fromPaise(billed),
            },
          ],
        },
        instalments: {
          create: [
            { seq: 1, label: 'Fees', dueDate, amount: fromPaise(billed) },
          ],
        },
      },
      select: { id: true },
    });
    invoiceId = invoice.id;
  }

  let paymentId: string | null = null;
  if (plan.pay > 0 && invoiceId) {
    const paidOn = row.paidOn ?? todayIso();
    // The receipt series of the year the money came in (the fees' own year if the date is in none).
    const receiptYear =
      (await tx.academicYear.findFirst({
        where: {
          schoolId: ctx.schoolId,
          startDate: { lte: dateOnly(paidOn) },
          endDate: { gte: dateOnly(paidOn) },
        },
        orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
        select: { id: true },
      })) ?? year;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`receipts:${ctx.schoolId}:${receiptYear.id}`}))`;
    const last = await tx.payment.aggregate({
      where: { schoolId: ctx.schoolId, academicYearId: receiptYear.id },
      _max: { receiptSeq: true },
    });
    const payment = await tx.payment.create({
      data: {
        schoolId: ctx.schoolId,
        studentId: row.studentId,
        academicYearId: receiptYear.id,
        receiptSeq: (last._max.receiptSeq ?? 0) + 1,
        amount: fromPaise(plan.pay),
        mode: row.mode,
        reference: row.reference,
        paidOn: dateOnly(paidOn),
        note: row.note
          ? `Imported total. ${row.note}`
          : 'Imported total of payments made so far',
        receivedById: ctx.userId,
        importBatchId: ctx.batchId,
        allocations: { create: [{ invoiceId, amount: fromPaise(plan.pay) }] },
      },
      select: { id: true },
    });
    paymentId = payment.id;
  }
  return { invoiceId: invoiceId!, paymentId };
}
