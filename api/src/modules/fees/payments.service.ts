import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { AuthContext } from '../../common/auth-context.js';
import { dateOnly, todayIso } from '../../common/dates.js';
import { Page, skipTake } from '../../common/dto/page-query.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { StudentsService } from '../students/students.service.js';
import {
  CollectionQueryDto,
  ListPaymentsQueryDto,
  ReasonDto,
  RecordPaymentDto,
} from './dto/fees.dto.js';
import { receiptNumber } from './invoices.service.js';
import { invoiceTotals } from './invoice-totals.js';
import {
  LedgerError,
  allocateOldestFirst,
  checkAllocations,
  fromPaise,
  money2,
  toPaise,
} from './ledger.js';

/** Modes that must carry a reference (cheque number, UPI reference, bank transaction id). */
const NEEDS_REFERENCE = new Set(['CHEQUE', 'UPI', 'BANK_TRANSFER']);

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly students: StudentsService,
  ) {}

  /**
   * Records money received for a student and spreads it over what they owe: the oldest dues
   * first, or as the accountant chooses. A payment can cover part of an invoice or several.
   * It can never be more than what is owed. Payments are never edited; see `reverse`.
   */
  async record(
    auth: AuthContext,
    studentId: string,
    dto: RecordPaymentDto,
    ip?: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId: auth.schoolId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    if (dto.mode === 'ONLINE')
      throw new BadRequestException('Online payment is not available yet');
    if (NEEDS_REFERENCE.has(dto.mode) && !dto.reference) {
      throw new BadRequestException(
        dto.mode === 'CHEQUE'
          ? 'Enter the cheque number'
          : 'Enter the transaction reference',
      );
    }
    const paidOn = dto.paidOn?.slice(0, 10) ?? todayIso();
    if (paidOn > todayIso())
      throw new BadRequestException('The payment date cannot be in the future');

    let amount: number;
    try {
      amount = toPaise(dto.amount);
    } catch (error) {
      throw this.asBadRequest(error);
    }
    if (amount <= 0)
      throw new BadRequestException('The amount must be more than zero');

    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId: auth.schoolId, isCurrent: true },
      select: { id: true, name: true },
    });
    if (!year)
      throw new BadRequestException('Set a current academic year first');

    const payment = await this.prisma.$transaction(async (tx) => {
      // One payment or concession at a time per student, so two cashiers cannot both
      // pay off the same dues; and one receipt number at a time per year.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fees-student:${studentId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`receipts:${auth.schoolId}:${year.id}`}))`;

      const invoices = await tx.feeInvoice.findMany({
        where: { studentId, schoolId: auth.schoolId },
        select: {
          id: true,
          createdAt: true,
          academicYear: { select: { startDate: true } },
        },
      });
      const totals = new Map(
        (
          await invoiceTotals(tx, auth.schoolId, { studentIds: [studentId] })
        ).map((t) => [t.invoiceId, t.pending]),
      );
      const owing = invoices
        .sort(
          (a, b) =>
            a.academicYear.startDate.getTime() -
              b.academicYear.startDate.getTime() ||
            a.createdAt.getTime() - b.createdAt.getTime(),
        )
        .map((i) => ({ id: i.id, pending: totals.get(i.id) ?? 0 }));

      let allocations: { invoiceId: string; amount: number }[];
      try {
        if (dto.allocations?.length) {
          allocations = dto.allocations.map((a) => ({
            invoiceId: a.invoiceId,
            amount: toPaise(a.amount),
          }));
          checkAllocations(owing, allocations, amount);
        } else {
          allocations = allocateOldestFirst(owing, amount);
        }
      } catch (error) {
        throw this.asBadRequest(error);
      }

      const last = await tx.payment.aggregate({
        where: { schoolId: auth.schoolId, academicYearId: year.id },
        _max: { receiptSeq: true },
      });
      return tx.payment.create({
        data: {
          schoolId: auth.schoolId,
          studentId,
          academicYearId: year.id,
          receiptSeq: (last._max.receiptSeq ?? 0) + 1,
          amount: fromPaise(amount),
          mode: dto.mode,
          reference: dto.reference || null,
          bank: dto.bank || null,
          paidOn: dateOnly(paidOn),
          note: dto.note || null,
          receivedById: auth.userId,
          allocations: {
            create: allocations.map((a) => ({
              invoiceId: a.invoiceId,
              amount: fromPaise(a.amount),
            })),
          },
        },
        include: { allocations: true },
      });
    });

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'fees.payment_recorded',
      entityType: 'payment',
      entityId: payment.id,
      metadata: { amount: fromPaise(amount), mode: dto.mode },
      ip,
    });
    return this.detail(auth, payment.id);
  }

  /** Cancels a whole payment (a bounced cheque, a wrong entry). The reason is required. */
  async reverse(auth: AuthContext, id: string, dto: ReasonDto, ip?: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, schoolId: auth.schoolId },
      include: { reversal: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.reversal)
      throw new ConflictException('This payment was already reversed');

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fees-student:${payment.studentId}`}))`;
        await tx.paymentReversal.create({
          data: {
            paymentId: id,
            reason: dto.reason,
            reversedById: auth.userId,
            reversedOn: dateOnly(todayIso()),
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This payment was already reversed');
      }
      throw error;
    }
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'fees.payment_reversed',
      entityType: 'payment',
      entityId: id,
      metadata: { amount: money2(payment.amount) },
      ip,
    });
    return this.detail(auth, id);
  }

  async detail(auth: AuthContext, id: string) {
    const p = await this.load(auth, id);
    return {
      id: p.id,
      receiptNo: receiptNumber(p.academicYear.name, p.receiptSeq),
      student: {
        id: p.student.id,
        admissionNo: p.student.admissionNo,
        fullName: [p.student.firstName, p.student.fatherName, p.student.surname]
          .filter(Boolean)
          .join(' '),
      },
      amount: money2(p.amount),
      mode: p.mode,
      reference: p.reference,
      bank: p.bank,
      paidOn: p.paidOn.toISOString().slice(0, 10),
      note: p.note,
      reversed: p.reversal
        ? {
            reason: p.reversal.reason,
            on: p.reversal.reversedOn.toISOString().slice(0, 10),
          }
        : null,
      allocations: p.allocations.map((a) => ({
        invoiceId: a.invoiceId,
        amount: money2(a.amount),
      })),
    };
  }

  async list(
    schoolId: string,
    q: ListPaymentsQueryDto,
  ): Promise<Page<Awaited<ReturnType<PaymentsService['row']>>>> {
    const where: Prisma.PaymentWhereInput = {
      schoolId,
      ...(q.mode ? { mode: q.mode } : {}),
      ...(q.studentId ? { studentId: q.studentId } : {}),
      ...(q.from || q.to
        ? {
            paidOn: {
              ...(q.from ? { gte: dateOnly(q.from.slice(0, 10)) } : {}),
              ...(q.to ? { lte: dateOnly(q.to.slice(0, 10)) } : {}),
            },
          }
        : {}),
      ...(q.search
        ? {
            student: {
              OR: [
                { firstName: { contains: q.search, mode: 'insensitive' } },
                { surname: { contains: q.search, mode: 'insensitive' } },
                { admissionNo: { contains: q.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
        include: {
          academicYear: { select: { name: true } },
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              fatherName: true,
              surname: true,
            },
          },
          reversal: { select: { reason: true } },
        },
        ...skipTake(q),
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.row(r)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  private row(p: {
    id: string;
    receiptSeq: number;
    amount: Prisma.Decimal;
    mode: string;
    reference: string | null;
    paidOn: Date;
    academicYear: { name: string };
    student: {
      id: string;
      admissionNo: string;
      firstName: string;
      fatherName: string | null;
      surname: string;
    };
    reversal: { reason: string } | null;
  }) {
    return {
      id: p.id,
      receiptNo: receiptNumber(p.academicYear.name, p.receiptSeq),
      studentId: p.student.id,
      admissionNo: p.student.admissionNo,
      studentName: [
        p.student.firstName,
        p.student.fatherName,
        p.student.surname,
      ]
        .filter(Boolean)
        .join(' '),
      amount: money2(p.amount),
      mode: p.mode,
      reference: p.reference,
      paidOn: p.paidOn.toISOString().slice(0, 10),
      reversed: !!p.reversal,
    };
  }

  /** Money collected between two dates, by payment mode. Reversed payments are left out. */
  async collection(schoolId: string, q: CollectionQueryDto) {
    const rows = await this.prisma.$queryRaw<
      { mode: string; total: Prisma.Decimal; count: bigint }[]
    >`
      SELECT p.mode::text AS mode, SUM(p.amount) AS total, COUNT(*) AS count
      FROM payments p
      WHERE p.school_id = ${schoolId}::uuid
        AND p.paid_on BETWEEN ${dateOnly(q.from.slice(0, 10))} AND ${dateOnly(q.to.slice(0, 10))}
        AND NOT EXISTS (SELECT 1 FROM payment_reversals r WHERE r.payment_id = p.id)
      GROUP BY p.mode ORDER BY p.mode`;
    const byMode = rows.map((r) => ({
      mode: r.mode,
      total: money2(r.total),
      count: Number(r.count),
    }));
    const total = byMode.reduce((a, r) => a + toPaise(r.total), 0);
    return {
      from: q.from.slice(0, 10),
      to: q.to.slice(0, 10),
      total: fromPaise(total),
      byMode,
    };
  }

  /** A one-page receipt. Whoever may see the student's fees may download it. */
  async receiptPdf(auth: AuthContext, id: string): Promise<Buffer> {
    const p = await this.load(auth, id);
    const school = await this.prisma.school.findUniqueOrThrow({
      where: { id: auth.schoolId },
    });
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { id: { in: p.allocations.map((a) => a.invoiceId) } },
      select: {
        id: true,
        kind: true,
        academicYear: { select: { name: true } },
      },
    });
    const label = new Map(
      invoices.map((i) => [
        i.id,
        `${i.kind === 'OPENING_BALANCE' ? 'Previous dues' : 'Fees'} ${i.academicYear.name}`,
      ]),
    );
    const totalsAfter = await invoiceTotals(this.prisma, auth.schoolId, {
      studentIds: [p.studentId],
    });
    const balance = totalsAfter.reduce((a, t) => a + t.pending, 0);

    const doc = await PDFDocument.create();
    const page = doc.addPage([420, 595]); // A5
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    let y = 555;
    const line = (
      text: string,
      opts: {
        size?: number;
        bold?: boolean;
        x?: number;
        color?: [number, number, number];
      } = {},
    ) => {
      page.drawText(text, {
        x: opts.x ?? 36,
        y,
        size: opts.size ?? 10,
        font: opts.bold ? bold : font,
        color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.1),
      });
      y -= (opts.size ?? 10) + 7;
    };
    const row = (left: string, right: string, b = false) => {
      page.drawText(left, { x: 36, y, size: 10, font: b ? bold : font });
      const w = (b ? bold : font).widthOfTextAtSize(right, 10);
      page.drawText(right, { x: 384 - w, y, size: 10, font: b ? bold : font });
      y -= 17;
    };
    const safe = (s: string) => s.replace(/[^\x20-\x7E]/g, '?'); // standard fonts have no Indian scripts

    line(safe(school.name), { size: 16, bold: true });
    if (school.address)
      line(safe(school.address), { size: 9, color: [0.4, 0.4, 0.4] });
    if (school.phone)
      line(`Phone: ${safe(school.phone)}`, { size: 9, color: [0.4, 0.4, 0.4] });
    y -= 6;
    line(p.reversal ? 'FEE RECEIPT (REVERSED)' : 'FEE RECEIPT', {
      size: 12,
      bold: true,
    });
    y -= 4;
    row('Receipt no.', receiptNumber(p.academicYear.name, p.receiptSeq), true);
    row('Date', p.paidOn.toISOString().slice(0, 10));
    row(
      'Student',
      safe(
        [p.student.firstName, p.student.fatherName, p.student.surname]
          .filter(Boolean)
          .join(' '),
      ),
    );
    row('Admission no.', safe(p.student.admissionNo));
    row(
      'Paid by',
      p.mode.replace('_', ' ') + (p.reference ? ` (${safe(p.reference)})` : ''),
    );
    y -= 8;
    line('Applied to', { bold: true });
    for (const a of p.allocations) {
      row(label.get(a.invoiceId) ?? 'Fees', `Rs. ${money2(a.amount)}`);
    }
    y -= 4;
    row('Amount received', `Rs. ${money2(p.amount)}`, true);
    row('Balance still due (all years)', `Rs. ${fromPaise(balance)}`);
    if (p.reversal) {
      y -= 8;
      line(
        `Reversed on ${p.reversal.reversedOn.toISOString().slice(0, 10)}: ${safe(p.reversal.reason)}`,
        {
          size: 9,
          color: [0.7, 0.1, 0.1],
        },
      );
    }
    return Buffer.from(await doc.save());
  }

  // ---------- helpers ----------

  /** The payment with what a receipt needs. A student's own payments are visible to whoever may see their fees. */
  private async load(auth: AuthContext, id: string) {
    const p = await this.prisma.payment.findFirst({
      where: { id, schoolId: auth.schoolId },
      include: {
        academicYear: { select: { name: true } },
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            fatherName: true,
            surname: true,
          },
        },
        allocations: true,
        reversal: true,
      },
    });
    if (!p) throw new NotFoundException('Payment not found');
    if (!auth.permissions.includes('fees.read_all')) {
      await this.students.assertVisible(auth, p.studentId);
    }
    return p;
  }

  private asBadRequest(error: unknown): unknown {
    return error instanceof LedgerError
      ? new BadRequestException(error.message)
      : error;
  }
}
