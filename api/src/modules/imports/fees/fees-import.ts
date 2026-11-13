import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type ExcelJS from 'exceljs';
import type { AuthContext } from '../../../common/auth-context.js';
import { todayIso } from '../../../common/dates.js';
import { PrismaService } from '../../../database/prisma.service.js';
import type { PaymentMode } from '../../../generated/prisma/enums.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  ImportedYearFees,
  planYearFees,
  writeYearFees,
  yearFeesNow,
} from '../../fees/imported-fees.js';
import { fromPaise, toPaise } from '../../fees/ledger.js';
import {
  Choice,
  Parsed,
  asText,
  parseChoice,
  parseDate,
  parseMoney,
  parseText,
} from '../cells.js';
import {
  CheckResult,
  CheckedRow,
  ImportHandler,
  Template,
  messageOf,
} from '../import-types.js';
import {
  Column,
  FIRST_DATA_ROW,
  Lists,
  RowValues,
  addHowTo,
  addTable,
  newWorkbook,
  readTables,
  writeAbout,
} from '../workbook.js';

const MODES: Choice[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
];

interface Year {
  id: string;
  name: string;
  start: string;
  end: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const show = (isoDate: string) =>
  `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;
/** Excel sheet names: at most 31 characters, none of []:*?/\ . */
const sheetName = (name: string) =>
  name.replace(/[[\]:*?/\\]/g, '-').slice(0, 31);

/**
 * Fees from Excel, one row per student per year: what was billed and what had been paid. The
 * due is worked out, never typed in. Brings in the last few years when the school starts using
 * the app, and serves for any year whose fees were kept on paper.
 */
@Injectable()
export class FeesImport implements ImportHandler {
  readonly kind = 'FEES' as const;
  readonly permissions = ['fees.structure.manage', 'fees.payment.create'];
  readonly prefilled = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The years asked for: one, or every year that has started ("all"). */
  private async years(
    schoolId: string,
    input: Record<string, unknown>,
  ): Promise<Year[]> {
    const all = await this.prisma.academicYear.findMany({
      where: { schoolId },
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
      },
    });
    const pick = (ys: typeof all) =>
      ys.map((y) => ({
        id: y.id,
        name: y.name,
        start: iso(y.startDate),
        end: iso(y.endDate),
      }));
    const wanted = input.academicYearIds ?? input.academicYearId;
    if (Array.isArray(wanted))
      return pick(all.filter((y) => wanted.includes(y.id)));
    if (wanted === 'all')
      return pick(all.filter((y) => iso(y.startDate) <= todayIso()));
    const one =
      typeof wanted === 'string'
        ? all.find((y) => y.id === wanted)
        : all.find((y) => y.isCurrent);
    if (!one)
      throw new BadRequestException(
        typeof wanted === 'string'
          ? 'Unknown academic year'
          : 'Set a current academic year first',
      );
    return pick([one]);
  }

  /** Students enrolled in a year, in class order, with what the app already holds for them. */
  private async students(schoolId: string, year: Year) {
    const enrolments = await this.prisma.enrollment.findMany({
      where: {
        schoolId,
        academicYearId: year.id,
        student: { status: { not: 'REMOVED' } },
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
            name: true,
            class: { select: { name: true, sortOrder: true } },
          },
        },
      },
    });
    enrolments.sort(
      (a, b) =>
        a.division.class.sortOrder - b.division.class.sortOrder ||
        a.division.name.localeCompare(b.division.name) ||
        a.student.firstName.localeCompare(b.student.firstName),
    );
    const now = await yearFeesNow(
      this.prisma,
      schoolId,
      enrolments.map((e) => e.student.id),
      year.id,
    );
    return enrolments.map((e) => ({
      id: e.student.id,
      admissionNo: e.student.admissionNo,
      name: [e.student.firstName, e.student.fatherName, e.student.surname]
        .filter(Boolean)
        .join(' '),
      cls: `${e.division.class.name} - ${e.division.name}`,
      now: now.get(e.student.id),
    }));
  }

  // ---------------------------------------------------------------------------
  // Template
  // ---------------------------------------------------------------------------

  async template(
    auth: AuthContext,
    input: Record<string, unknown>,
  ): Promise<Template> {
    const years = await this.years(auth.schoolId, input);
    if (years.length === 0)
      throw new BadRequestException('No academic year has started yet');
    const wb = newWorkbook();
    addHowTo(wb, 'Fees billed and paid: how to fill this file', [
      'One sheet per academic year, one row per student enrolled that year. The grey columns come from the app: do not change them.',
      'Billed: the fees for that year, after any concession, in rupees. Paid so far: everything the family paid towards that year. Due is worked out for you (Billed minus Paid).',
      'Last paid on: the date of the last payment (DD/MM/YYYY). The amount paid is recorded as one payment on that day, with a receipt in that year.',
      'Mode: how most of it was paid. Reference and note are optional (for example the old receipt numbers).',
      '',
      'Rows already in the app show their amounts. Leave them as they are: they are skipped. A row left blank is skipped too.',
      "An amount already billed or paid in the app cannot be changed from here: use the student's page (a concession, or record a payment).",
      '',
      'Dues from earlier years carry forward by themselves: each year is billed separately and the balance is always worked out from what was billed and paid.',
      '',
      'When you upload the file, nothing is saved at first: the app checks every row and shows what it found.',
    ]);
    const lists = new Lists(wb);
    const modeList = lists.add(
      'Mode',
      MODES.map((m) => m.label),
    );
    const columns: Column[] = [
      {
        key: 'admissionNo',
        header: 'Admission no',
        given: true,
        format: 'text',
        width: 14,
      },
      { key: 'name', header: 'Student', given: true, width: 28 },
      { key: 'class', header: 'Class', given: true, width: 14 },
      {
        key: 'billed',
        header: 'Billed (₹)',
        format: 'money',
        width: 14,
        note: "The year's fees after any concession.",
      },
      {
        key: 'paid',
        header: 'Paid so far (₹)',
        format: 'money',
        width: 14,
        note: 'Blank means nothing was paid.',
      },
      {
        key: 'due',
        header: 'Due (₹)',
        given: true,
        format: 'money',
        width: 12,
        note: 'Worked out: Billed minus Paid.',
      },
      { key: 'paidOn', header: 'Last paid on', format: 'date', width: 14 },
      {
        key: 'mode',
        header: 'Mode',
        list: modeList,
        width: 14,
        note: 'Blank means Cash.',
      },
      {
        key: 'reference',
        header: 'Reference',
        format: 'text',
        width: 18,
        note: 'Cheque number, UPI reference or old receipt numbers.',
      },
      { key: 'note', header: 'Note', width: 30 },
    ];
    for (const year of years) {
      const students = await this.students(auth.schoolId, year);
      const rows: RowValues[] = students.map((s) => ({
        admissionNo: s.admissionNo,
        name: s.name,
        class: s.cls,
        billed: s.now ? Number(fromPaise(s.now.billed)) : null,
        paid: s.now ? Number(fromPaise(s.now.paid)) : null,
      }));
      const ws = addTable(wb, sheetName(year.name), columns, rows, {
        prepared: Math.max(rows.length, 50),
        freezeColumns: 2,
      });
      // Due = Billed - Paid, worked out by Excel as people type.
      const col = (key: string) =>
        ws.getColumn(columns.findIndex((c) => c.key === key) + 1).letter;
      for (let i = 0; i < rows.length; i++) {
        const r = FIRST_DATA_ROW + i;
        ws.getCell(`${col('due')}${r}`).value = {
          formula: `IF(${col('billed')}${r}="","",${col('billed')}${r}-N(${col('paid')}${r}))`,
        };
      }
    }
    writeAbout(wb, {
      kind: this.kind,
      schoolId: auth.schoolId,
      params: { academicYearIds: years.map((y) => y.id) },
    });
    const name = years.length === 1 ? years[0].name : 'all-years';
    return { fileName: `fees-${name}.xlsx`, workbook: wb };
  }

  // ---------------------------------------------------------------------------
  // Check
  // ---------------------------------------------------------------------------

  async check(
    auth: AuthContext,
    wb: ExcelJS.Workbook,
    params: Record<string, unknown>,
  ): Promise<CheckResult> {
    const years = await this.years(auth.schoolId, params);
    const tables = readTables(wb);
    const rows: CheckedRow[] = [];
    for (const year of years) {
      const table = tables.find((t) => t.sheet === sheetName(year.name));
      if (!table) continue;
      const students = await this.students(auth.schoolId, year);
      const byNo = new Map(
        students.map((s) => [s.admissionNo.toLowerCase(), s]),
      );
      const seen = new Set<string>();
      for (const r of table.rows) {
        const row: CheckedRow = {
          sheet: r.sheet,
          rowNumber: r.rowNumber,
          label: `${year.name}, row ${r.rowNumber}`,
          values: r.values,
          errors: [],
          warnings: [],
        };
        rows.push(row);
        try {
          this.checkRow(row, year, byNo, seen);
        } catch (error) {
          row.errors.push(messageOf(error));
        }
      }
    }
    return { params: { academicYearIds: years.map((y) => y.id) }, rows };
  }

  private checkRow(
    row: CheckedRow,
    year: Year,
    byNo: Map<string, Awaited<ReturnType<FeesImport['students']>>[number]>,
    seen: Set<string>,
  ) {
    const v = row.values;
    const errors = row.errors;
    const take = <T>(p: Parsed<T>): T | undefined => {
      if (p.ok) return p.value;
      errors.push(p.error);
      return undefined;
    };
    const no = asText(v.admissionNo);
    const student = byNo.get(no.toLowerCase());
    if (!student) {
      errors.push(
        no
          ? `No student with admission number ${no} is enrolled in ${year.name}`
          : 'Admission no is missing',
      );
      return;
    }
    row.label = `${student.name} (${student.admissionNo}), ${year.name}`;
    if (seen.has(student.id)) {
      errors.push(`${student.name} appears twice in ${year.name}`);
      return;
    }
    seen.add(student.id);

    const billedText = take(parseMoney(v.billed, 'Billed'));
    const paidText = take(parseMoney(v.paid, 'Paid so far'));
    if (billedText === undefined || paidText === undefined) return;
    if (billedText === null && paidText === null) {
      row.unchanged = true; // nothing filled in: nothing to do
      return;
    }
    if (billedText === null) {
      errors.push("Fill in Billed (the year's fees) before Paid");
      return;
    }
    const billed = toPaise(billedText);
    const paid = paidText ? toPaise(paidText) : 0;
    const plan = planYearFees({ billed, paid }, student.now);
    if (plan.error) {
      errors.push(plan.error);
      return;
    }
    if (plan.unchanged) {
      row.unchanged = true;
      return;
    }

    let paidOn = take(parseDate(v.paidOn, 'Last paid on')) ?? null;
    const today = todayIso();
    if (plan.pay > 0) {
      paidOn ??= year.end < today ? year.end : today;
      if (paidOn > today) errors.push('Last paid on cannot be in the future');
      else if (paidOn < year.start || paidOn > year.end)
        row.warnings.push(
          `Last paid on (${show(paidOn)}) is outside ${year.name}; the receipt goes in the year it was paid`,
        );
    } else if (paidOn) {
      row.warnings.push('Last paid on is ignored: nothing was paid');
      paidOn = null;
    }
    const mode = (take(parseChoice(v.mode, MODES, 'Mode')) ??
      'CASH') as PaymentMode;
    const reference = take(parseText(v.reference, 'Reference', 100)) ?? null;
    const note = take(parseText(v.note, 'Note', 300)) ?? null;
    if (errors.length) return;

    if (paid === 0)
      row.warnings.push(`Nothing paid: ₹${fromPaise(billed)} will show as due`);

    const data: ImportedYearFees = {
      studentId: student.id,
      academicYearId: year.id,
      billed: fromPaise(billed),
      paid: fromPaise(paid),
      paidOn,
      mode,
      reference,
      note,
    };
    row.data = data;
  }

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------

  async run(
    auth: AuthContext,
    batch: { id: string; params: Record<string, unknown> },
    rows: CheckedRow[],
  ): Promise<void> {
    for (const row of rows) {
      const data = row.data as ImportedYearFees;
      try {
        const done = await this.prisma.$transaction((tx) =>
          writeYearFees(
            tx,
            { schoolId: auth.schoolId, userId: auth.userId, batchId: batch.id },
            data,
          ),
        );
        row.outcome = {
          status: 'IMPORTED',
          ref: { type: 'student', id: data.studentId },
        };
        await this.audit.log({
          schoolId: auth.schoolId,
          actorUserId: auth.userId,
          action: 'fees.imported',
          entityType: 'student',
          entityId: data.studentId,
          metadata: {
            importBatchId: batch.id,
            academicYearId: data.academicYearId,
            billed: data.billed,
            paid: data.paid,
            invoiceId: done.invoiceId,
            paymentId: done.paymentId,
          },
        });
      } catch (error) {
        row.outcome = { status: 'FAILED', message: messageOf(error) };
      }
    }
  }

  /**
   * One student's year typed in on the student's page: the same rules as a file row. Returns the
   * row values a one-row batch is made from.
   */
  async singleRow(
    auth: AuthContext,
    input: {
      studentId: string;
      academicYearId: string;
      billed: string;
      paid?: string;
      paidOn?: string;
      mode?: string;
      reference?: string;
      note?: string;
    },
  ): Promise<{
    sheet: string;
    values: RowValues;
    params: Record<string, unknown>;
  }> {
    const [year, student] = await Promise.all([
      this.prisma.academicYear.findFirst({
        where: { id: input.academicYearId, schoolId: auth.schoolId },
      }),
      this.prisma.student.findFirst({
        where: { id: input.studentId, schoolId: auth.schoolId },
        select: { admissionNo: true },
      }),
    ]);
    if (!year) throw new BadRequestException('Unknown academic year');
    if (!student) throw new NotFoundException('Student not found');
    return {
      sheet: sheetName(year.name),
      params: { academicYearIds: [year.id] },
      values: {
        admissionNo: student.admissionNo,
        billed: input.billed,
        paid: input.paid ?? null,
        paidOn: input.paidOn ?? null,
        mode:
          MODES.find((m) => m.value === input.mode)?.label ??
          input.mode ??
          null,
        reference: input.reference ?? null,
        note: input.note ?? null,
      },
    };
  }

  /** Checks one row the same way as a file row. */
  async checkOne(
    auth: AuthContext,
    params: Record<string, unknown>,
    sheet: string,
    values: RowValues,
  ): Promise<CheckedRow> {
    const [year] = await this.years(auth.schoolId, params);
    const students = await this.students(auth.schoolId, year);
    const row: CheckedRow = {
      sheet,
      rowNumber: FIRST_DATA_ROW,
      label: year.name,
      values,
      errors: [],
      warnings: [],
    };
    this.checkRow(
      row,
      year,
      new Map(students.map((s) => [s.admissionNo.toLowerCase(), s])),
      new Set(),
    );
    return row;
  }
}
