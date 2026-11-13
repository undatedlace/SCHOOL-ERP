import { Injectable } from '@nestjs/common';
import type ExcelJS from 'exceljs';
import type { AuthContext } from '../../../common/auth-context.js';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  Status,
  toDate,
  toIso,
  todayInIndia,
} from '../../attendance/attendance-rules.js';
import { holidayDates } from '../../leave/holidays.js';
import { leaveDates } from '../../leave/leave-rules.js';
import { asText } from '../cells.js';
import {
  CheckResult,
  CheckedRow,
  ImportHandler,
  Template,
  messageOf,
} from '../import-types.js';
import {
  Lists,
  RowValues,
  addTable,
  addHowTo,
  newWorkbook,
  readTables,
  writeAbout,
} from '../workbook.js';
import {
  MARKS,
  dayKey,
  dayOf,
  isDayKey,
  monthDays,
  monthParam,
  monthTitle,
  parseMark,
  registerColumns,
  shadeRegister,
  showDay,
} from './register-grid.js';

const SHEET = 'Staff';

interface Person {
  staffId: string;
  employeeNo: string;
  name: string;
  designation: string | null;
  /** Days of the month the person worked here (joined, not yet left). */
  days: Set<string>;
}

interface RowData {
  staffId: string;
  entries: { date: string; status: Status }[];
}

/**
 * Staff attendance from a monthly register: everyone who worked here that month down the side,
 * the days across. Approved leave is filled in as LV; leaving it as it is keeps the leave as the
 * reason (nothing is written), and writing another mark over it is allowed with a warning, the
 * same as marking by hand.
 */
@Injectable()
export class StaffAttendanceImport implements ImportHandler {
  readonly kind = 'STAFF_ATTENDANCE' as const;
  readonly permissions = ['staff_attendance.manage'];
  readonly prefilled = true;

  constructor(private readonly prisma: PrismaService) {}

  private async people(schoolId: string, days: string[]): Promise<Person[]> {
    const first = days[0];
    const last = days[days.length - 1];
    const staff = await this.prisma.staff.findMany({
      where: {
        schoolId,
        joinedOn: { lte: toDate(last) },
        OR: [{ leftOn: null }, { leftOn: { gte: toDate(first) } }],
      },
      select: {
        id: true,
        employeeNo: true,
        firstName: true,
        surname: true,
        designation: true,
        joinedOn: true,
        leftOn: true,
      },
      orderBy: [{ firstName: 'asc' }, { surname: 'asc' }],
    });
    return staff.map((s) => ({
      staffId: s.id,
      employeeNo: s.employeeNo,
      name: `${s.firstName} ${s.surname}`,
      designation: s.designation,
      days: new Set(
        days.filter(
          (d) => toIso(s.joinedOn) <= d && (!s.leftOn || toIso(s.leftOn) >= d),
        ),
      ),
    }));
  }

  /** Approved leave in the month: person to day to the kind of leave (Sundays and holidays left out). */
  private async leave(schoolId: string, days: string[], holidays: Set<string>) {
    const from = days[0];
    const to = days[days.length - 1];
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        schoolId,
        status: 'APPROVED',
        startsOn: { lte: toDate(to) },
        endsOn: { gte: toDate(from) },
      },
      select: {
        staffId: true,
        startsOn: true,
        endsOn: true,
        leaveType: { select: { name: true } },
      },
    });
    const out = new Map<string, string>();
    for (const r of rows) {
      const start = toIso(r.startsOn) < from ? from : toIso(r.startsOn);
      const end = toIso(r.endsOn) > to ? to : toIso(r.endsOn);
      for (const d of leaveDates(start, end, holidays))
        out.set(`${r.staffId}|${d}`, r.leaveType.name);
    }
    return out;
  }

  private async existing(schoolId: string, days: string[]) {
    const records = await this.prisma.staffAttendanceRecord.findMany({
      where: {
        schoolId,
        date: { gte: toDate(days[0]), lte: toDate(days[days.length - 1]) },
      },
      select: { staffId: true, date: true, status: true },
    });
    return new Map(
      records.map((r) => [`${r.staffId}|${toIso(r.date)}`, r.status]),
    );
  }

  async template(
    auth: AuthContext,
    input: Record<string, unknown>,
  ): Promise<Template> {
    const month = monthParam(input.month);
    const days = monthDays(month);
    const holidays = await holidayDates(
      this.prisma,
      auth.schoolId,
      days[0],
      days[days.length - 1],
    );
    const [people, leave, marks] = await Promise.all([
      this.people(auth.schoolId, days),
      this.leave(auth.schoolId, days, holidays),
      this.existing(auth.schoolId, days),
    ]);
    const wb = newWorkbook();
    addHowTo(
      wb,
      `Staff attendance, ${monthTitle(month)}: how to fill this file`,
      [
        'One row per member of staff who worked here during the month, one column per day.',
        'In each box write P (present), A (absent), L (late) or LV (on leave). Marks already in the app are filled in.',
        'Approved leave is filled in as LV. Leave it as it is; writing another mark over it replaces the leave for that day.',
        'Leave a box blank when attendance was not taken. A blank box changes nothing.',
        'Grey boxes cannot be marked (before the person joined, after they left, or a day still to come). Sundays and school holidays are shaded lightly.',
        '',
        'When you upload the file, nothing is saved at first: the app checks every box and shows what it found.',
      ],
    );
    const lists = new Lists(wb);
    const columns = registerColumns(
      [
        {
          key: 'employeeNo',
          header: 'Employee no',
          given: true,
          format: 'text',
          width: 13,
        },
        { key: 'name', header: 'Name', given: true, width: 24 },
        { key: 'designation', header: 'Designation', given: true, width: 16 },
      ],
      days,
      lists,
    );
    const rows: RowValues[] = people.map((p) => {
      const values: RowValues = {
        employeeNo: p.employeeNo,
        name: p.name,
        designation: p.designation,
      };
      for (const d of days) {
        const status =
          marks.get(`${p.staffId}|${d}`) ??
          (leave.has(`${p.staffId}|${d}`) ? 'ON_LEAVE' : null);
        if (status) values[dayKey(d)] = MARKS[status];
      }
      return values;
    });
    const ws = addTable(wb, SHEET, columns, rows, {
      prepared: rows.length,
      freezeColumns: 2,
    });
    shadeRegister(
      ws,
      columns,
      rows.length,
      (i, d) => !people[i].days.has(d),
      holidays,
    );
    writeAbout(wb, {
      kind: this.kind,
      schoolId: auth.schoolId,
      params: { month },
    });
    return { fileName: `staff-attendance-${month}.xlsx`, workbook: wb };
  }

  async check(
    auth: AuthContext,
    wb: ExcelJS.Workbook,
    params: Record<string, unknown>,
  ): Promise<CheckResult> {
    const month = monthParam(params.month);
    const days = monthDays(month);
    const today = todayInIndia();
    const holidays = await holidayDates(
      this.prisma,
      auth.schoolId,
      days[0],
      days[days.length - 1],
    );
    const [people, leave, marks] = await Promise.all([
      this.people(auth.schoolId, days),
      this.leave(auth.schoolId, days, holidays),
      this.existing(auth.schoolId, days),
    ]);
    const byNo = new Map(people.map((p) => [p.employeeNo.toLowerCase(), p]));
    const table = readTables(wb).find((t) => t.sheet === SHEET);
    const rows: CheckedRow[] = [];
    const seen = new Set<string>();
    for (const r of table?.rows ?? []) {
      const row: CheckedRow = {
        sheet: r.sheet,
        rowNumber: r.rowNumber,
        label: `Row ${r.rowNumber}`,
        values: r.values,
        errors: [],
        warnings: [],
      };
      rows.push(row);
      try {
        const who = byNo.get(asText(r.values.employeeNo).toLowerCase());
        if (!who) {
          row.errors.push(
            `${asText(r.values.employeeNo) || 'This row'} did not work here in ${monthTitle(month)}`,
          );
          continue;
        }
        row.label = who.name;
        if (seen.has(who.staffId)) {
          row.errors.push(`${who.name} appears twice`);
          continue;
        }
        seen.add(who.staffId);
        const entries: RowData['entries'] = [];
        for (const [key, value] of Object.entries(r.values)) {
          if (!isDayKey(key)) continue;
          const day = dayOf(key);
          const mark = parseMark(value, day);
          if (!mark.ok) {
            row.errors.push(mark.error);
            continue;
          }
          if (!mark.value) continue;
          if (day > today) {
            row.errors.push(`${showDay(day)} has not come yet`);
            continue;
          }
          if (!who.days.has(day)) {
            row.errors.push(
              `${showDay(day)}: ${who.name} was not working here that day`,
            );
            continue;
          }
          const saved = marks.get(`${who.staffId}|${day}`);
          const onLeave = leave.get(`${who.staffId}|${day}`);
          // What the app shows now: a mark by hand, or else approved leave.
          if ((saved ?? (onLeave ? 'ON_LEAVE' : null)) === mark.value) continue;
          if (!saved && onLeave)
            row.warnings.push(
              `${showDay(day)}: replaces approved ${onLeave.toLowerCase()} leave`,
            );
          entries.push({ date: day, status: mark.value });
        }
        if (row.errors.length) continue;
        if (entries.length === 0) {
          row.unchanged = true;
          continue;
        }
        const data: RowData = { staffId: who.staffId, entries };
        row.data = data;
      } catch (error) {
        row.errors.push(messageOf(error));
      }
    }
    return { params: { month }, rows };
  }

  async run(
    auth: AuthContext,
    _batch: unknown,
    rows: CheckedRow[],
  ): Promise<void> {
    for (const row of rows) {
      const data = row.data as RowData;
      try {
        await this.prisma.$transaction(
          data.entries.map((e) =>
            this.prisma.staffAttendanceRecord.upsert({
              where: {
                staffId_date: { staffId: data.staffId, date: toDate(e.date) },
              },
              create: {
                schoolId: auth.schoolId,
                staffId: data.staffId,
                date: toDate(e.date),
                status: e.status,
                source: 'IMPORT',
                markedById: auth.userId,
              },
              update: {
                status: e.status,
                source: 'IMPORT',
                markedById: auth.userId,
              },
            }),
          ),
        );
        row.outcome = { status: 'IMPORTED' };
      } catch (error) {
        row.outcome = { status: 'FAILED', message: messageOf(error) };
      }
    }
  }
}
