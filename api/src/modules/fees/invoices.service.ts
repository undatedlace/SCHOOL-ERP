import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { dateOnly, todayIso } from '../../common/dates.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { StudentsService } from '../students/students.service.js';
import {
  AddConcessionDto,
  GenerateInvoicesDto,
  OpeningBalanceDto,
  ReasonDto,
} from './dto/fees.dto.js';
import { invoiceTotals } from './invoice-totals.js';
import {
  LedgerError,
  fromPaise,
  money2,
  netInstalments,
  splitByWeights,
  toPaise,
  waterfall,
} from './ledger.js';

/** `2026-27/00012`: the receipt number shown to people. */
export const receiptNumber = (yearName: string, seq: number) =>
  `${yearName}/${String(seq).padStart(5, '0')}`;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly students: StudentsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Makes the year's invoices from the class fee structures, for every active student enrolled
   * in the year (or just the ones named). Safe to run again: a student who already has the
   * year's invoice is skipped, and invoices are copies, so editing a structure later changes nothing.
   */
  async generate(auth: AuthContext, dto: GenerateInvoicesDto, ip?: string) {
    const yearId =
      dto.academicYearId ?? (await this.currentYearId(auth.schoolId));
    if (!yearId)
      throw new BadRequestException('Set a current academic year first');
    const year = await this.prisma.academicYear.findFirst({
      where: { id: yearId, schoolId: auth.schoolId },
      select: { id: true },
    });
    if (!year) throw new BadRequestException('Unknown academic year');

    const enrolments = await this.prisma.enrollment.findMany({
      where: {
        schoolId: auth.schoolId,
        academicYearId: yearId,
        student: {
          status: 'ACTIVE',
          ...(dto.studentIds ? { id: { in: dto.studentIds } } : {}),
        },
        ...(dto.divisionId ? { divisionId: dto.divisionId } : {}),
        ...(dto.classId ? { division: { classId: dto.classId } } : {}),
      },
      select: {
        studentId: true,
        division: { select: { class: { select: { id: true, name: true } } } },
      },
    });

    const structures = await this.prisma.feeStructure.findMany({
      where: { schoolId: auth.schoolId, academicYearId: yearId },
      include: {
        items: { include: { feeHead: { select: { name: true } } } },
        instalments: { orderBy: { seq: 'asc' } },
      },
    });
    const byClass = new Map(structures.map((s) => [s.classId, s]));

    let created = 0;
    let alreadyHad = 0;
    const missing = new Map<
      string,
      { classId: string; className: string; students: number }
    >();

    for (const e of enrolments) {
      const cls = e.division.class;
      const s = byClass.get(cls.id);
      if (!s) {
        const m = missing.get(cls.id) ?? {
          classId: cls.id,
          className: cls.name,
          students: 0,
        };
        m.students++;
        missing.set(cls.id, m);
        continue;
      }
      const lines = s.items.map((i) => ({
        feeHeadId: i.feeHeadId,
        description: i.feeHead.name,
        amount: money2(i.amount),
      }));
      const total = lines.reduce((a, l) => a + toPaise(l.amount), 0);
      const parts = splitByWeights(
        total,
        s.instalments.map((i) => i.percentBp),
      );
      try {
        await this.prisma.feeInvoice.create({
          data: {
            schoolId: auth.schoolId,
            studentId: e.studentId,
            academicYearId: yearId,
            kind: 'FEE_STRUCTURE',
            structureId: s.id,
            createdById: auth.userId,
            lines: { create: lines },
            instalments: {
              create: s.instalments.map((i, n) => ({
                seq: i.seq,
                label: i.label,
                dueDate: i.dueDate,
                amount: fromPaise(parts[n]),
              })),
            },
          },
        });
        created++;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          alreadyHad++;
        } else throw error;
      }
    }

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'fees.invoices_generated',
      metadata: { created, alreadyHad, academicYearId: yearId },
      ip,
    });
    return { created, alreadyHad, noStructure: [...missing.values()] };
  }

  /** Dues from before the system (or from an earlier year), entered as one invoice. */
  async openingBalance(auth: AuthContext, dto: OpeningBalanceDto, ip?: string) {
    const [student, year] = await Promise.all([
      this.prisma.student.findFirst({
        where: { id: dto.studentId, schoolId: auth.schoolId },
        select: { id: true },
      }),
      this.prisma.academicYear.findFirst({
        where: { id: dto.academicYearId, schoolId: auth.schoolId },
        select: { id: true },
      }),
    ]);
    if (!student) throw new NotFoundException('Student not found');
    if (!year) throw new BadRequestException('Unknown academic year');
    const paise = this.money(dto.amount);
    if (paise <= 0)
      throw new BadRequestException('The amount must be more than zero');

    try {
      const invoice = await this.prisma.feeInvoice.create({
        data: {
          schoolId: auth.schoolId,
          studentId: dto.studentId,
          academicYearId: dto.academicYearId,
          kind: 'OPENING_BALANCE',
          note: dto.note,
          createdById: auth.userId,
          lines: {
            create: [
              { description: 'Previous dues', amount: fromPaise(paise) },
            ],
          },
          instalments: {
            create: [
              {
                seq: 1,
                label: 'Previous dues',
                dueDate: dateOnly(dto.dueDate.slice(0, 10)),
                amount: fromPaise(paise),
              },
            ],
          },
        },
        select: { id: true },
      });
      await this.audit.log({
        schoolId: auth.schoolId,
        actorUserId: auth.userId,
        action: 'fees.opening_balance_added',
        entityType: 'fee_invoice',
        entityId: invoice.id,
        metadata: { amount: fromPaise(paise) },
        ip,
      });
      return { id: invoice.id };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This student already has opening dues for that year',
        );
      }
      throw error;
    }
  }

  async addConcession(
    auth: AuthContext,
    invoiceId: string,
    dto: AddConcessionDto,
    ip?: string,
  ) {
    const invoice = await this.findInvoice(auth.schoolId, invoiceId);
    const paise = this.money(dto.amount);
    if (paise <= 0)
      throw new BadRequestException('The amount must be more than zero');

    const concession = await this.prisma.$transaction(async (tx) => {
      // Same lock as taking a payment for this student, so the two cannot interleave.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fees-student:${invoice.studentId}`}))`;
      const [t] = await invoiceTotals(tx, auth.schoolId, {
        invoiceIds: [invoiceId],
      });
      // The invoice must still cover what has already been paid on it.
      if (t.concessions + paise > t.gross - t.paid) {
        throw new BadRequestException(
          `A concession of ${fromPaise(paise)} is too much: ${fromPaise(t.gross - t.concessions)} is billed and ${fromPaise(t.paid)} has been paid`,
        );
      }
      return tx.concession.create({
        data: {
          schoolId: auth.schoolId,
          invoiceId,
          amount: fromPaise(paise),
          reason: dto.reason,
          createdById: auth.userId,
        },
      });
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'fees.concession_added',
      entityType: 'fee_invoice',
      entityId: invoiceId,
      metadata: { amount: fromPaise(paise) },
      ip,
    });
    return { id: concession.id };
  }

  async revokeConcession(
    auth: AuthContext,
    id: string,
    dto: ReasonDto,
    ip?: string,
  ) {
    const c = await this.prisma.concession.findFirst({
      where: { id, schoolId: auth.schoolId },
    });
    if (!c) throw new NotFoundException('Concession not found');
    if (c.revokedAt)
      throw new ConflictException('This concession was already taken back');
    await this.prisma.concession.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revokedById: auth.userId,
        revokedReason: dto.reason,
      },
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'fees.concession_revoked',
      entityType: 'fee_invoice',
      entityId: c.invoiceId,
      ip,
    });
  }

  /** Everything about one student's fees: invoices, what is due when, payments and the balance. */
  /**
   * Tells a student's class teacher that fees are pending, so they can speak to the family. Sent by the
   * accountant or an administrator. The message names the student and the amount; it goes to the teacher
   * of the student's division this academic year, as a notification in the app.
   */
  async remindClassTeacher(
    auth: AuthContext,
    studentId: string,
    note: string | undefined,
    ip?: string,
  ) {
    const ledger = await this.ledger(auth, studentId);
    const pending = ledger.totals.pending;
    if (Number(pending) <= 0) {
      throw new BadRequestException('This student has nothing pending');
    }
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId: auth.schoolId, isCurrent: true },
      select: { id: true },
    });
    const enrollment = year
      ? await this.prisma.enrollment.findFirst({
          where: { studentId, academicYearId: year.id },
          select: {
            divisionId: true,
            division: {
              select: { name: true, class: { select: { name: true } } },
            },
          },
        })
      : null;
    if (!year || !enrollment) {
      throw new BadRequestException('This student is not enrolled this year');
    }
    const label = `${enrollment.division.class.name}-${enrollment.division.name}`;
    const teacher = await this.prisma.classTeacher.findUnique({
      where: {
        academicYearId_divisionId: {
          academicYearId: year.id,
          divisionId: enrollment.divisionId,
        },
      },
      select: {
        staff: {
          select: {
            firstName: true,
            surname: true,
            userId: true,
            status: true,
          },
        },
      },
    });
    if (!teacher || teacher.staff.status !== 'ACTIVE') {
      throw new BadRequestException(
        `No class teacher is set for ${label}. Assign one in Academic setup.`,
      );
    }
    if (!teacher.staff.userId) {
      throw new BadRequestException(
        `${teacher.staff.firstName} ${teacher.staff.surname} has no login, so cannot be told`,
      );
    }
    await this.notifications.notify(auth.schoolId, [teacher.staff.userId], {
      type: 'fee.reminder',
      title: `Fees pending: ${ledger.student.fullName} (${label})`,
      body: [`Rs ${pending} is pending.`, note?.trim()]
        .filter(Boolean)
        .join(' '),
      link: `/app/students/${studentId}`,
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'fees.teacher_reminded',
      entityType: 'student',
      entityId: studentId,
      metadata: { pending, classTeacher: teacher.staff.userId },
      ip,
    });
    return {
      notified: `${teacher.staff.firstName} ${teacher.staff.surname}`,
      class: label,
    };
  }

  async ledger(auth: AuthContext, studentId: string) {
    if (!auth.permissions.includes('fees.read_all')) {
      await this.students.assertVisible(auth, studentId);
    }
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId: auth.schoolId },
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        fatherName: true,
        surname: true,
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const [invoices, payments, totals] = await Promise.all([
      this.prisma.feeInvoice.findMany({
        where: { studentId, schoolId: auth.schoolId },
        include: {
          academicYear: { select: { id: true, name: true, startDate: true } },
          lines: { orderBy: { id: 'asc' } },
          instalments: { orderBy: { seq: 'asc' } },
          concessions: { orderBy: { createdAt: 'asc' } },
        },
      }),
      this.prisma.payment.findMany({
        where: { studentId, schoolId: auth.schoolId },
        orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
        include: {
          academicYear: { select: { name: true } },
          allocations: true,
          reversal: true,
        },
      }),
      invoiceTotals(this.prisma, auth.schoolId, { studentIds: [studentId] }),
    ]);
    const totalById = new Map(totals.map((t) => [t.invoiceId, t]));
    const today = todayIso();

    // Oldest year first, opening dues before the year's own fees.
    invoices.sort(
      (a, b) =>
        a.academicYear.startDate.getTime() -
          b.academicYear.startDate.getTime() ||
        (a.kind === b.kind ? 0 : a.kind === 'OPENING_BALANCE' ? -1 : 1),
    );

    const out = invoices.map((inv) => {
      const t = totalById.get(inv.id)!;
      const net = netInstalments(
        inv.instalments.map((i) => toPaise(i.amount.toString())),
        t.concessions,
      );
      const status = waterfall(net, t.paid);
      return {
        id: inv.id,
        kind: inv.kind,
        note: inv.note,
        /** When it was billed: the first line of the student's fee statement. */
        createdAt: inv.createdAt,
        academicYear: { id: inv.academicYear.id, name: inv.academicYear.name },
        lines: inv.lines.map((l) => ({
          description: l.description,
          amount: money2(l.amount),
        })),
        concessions: inv.concessions.map((c) => ({
          id: c.id,
          amount: money2(c.amount),
          reason: c.reason,
          createdAt: c.createdAt,
          revoked: !!c.revokedAt,
          revokedReason: c.revokedReason,
        })),
        instalments: inv.instalments.map((i, n) => {
          const dueDate = i.dueDate.toISOString().slice(0, 10);
          return {
            seq: i.seq,
            label: i.label,
            dueDate,
            due: fromPaise(status[n].due),
            paid: fromPaise(status[n].paid),
            pending: fromPaise(status[n].pending),
            overdue: status[n].pending > 0 && dueDate < today,
          };
        }),
        gross: fromPaise(t.gross),
        concessionTotal: fromPaise(t.concessions),
        paid: fromPaise(t.paid),
        pending: fromPaise(t.pending),
      };
    });

    const sum = (f: (t: (typeof totals)[number]) => number) =>
      fromPaise(totals.reduce((a, t) => a + f(t), 0));
    return {
      student: {
        id: student.id,
        admissionNo: student.admissionNo,
        fullName: [student.firstName, student.fatherName, student.surname]
          .filter(Boolean)
          .join(' '),
      },
      totals: {
        gross: sum((t) => t.gross),
        concessions: sum((t) => t.concessions),
        paid: sum((t) => t.paid),
        pending: sum((t) => t.pending),
      },
      invoices: out,
      payments: payments.map((p) => ({
        id: p.id,
        receiptNo: receiptNumber(p.academicYear.name, p.receiptSeq),
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
      })),
    };
  }

  // ---------- helpers ----------

  private async findInvoice(schoolId: string, id: string) {
    const invoice = await this.prisma.feeInvoice.findFirst({
      where: { id, schoolId },
      select: { id: true, studentId: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private money(text: string): number {
    try {
      return toPaise(text);
    } catch (error) {
      if (error instanceof LedgerError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  private async currentYearId(schoolId: string) {
    const y = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    return y?.id ?? null;
  }
}
