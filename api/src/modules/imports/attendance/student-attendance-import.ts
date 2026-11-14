import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type ExcelJS from 'exceljs';
import type { AuthContext } from '../../../common/auth-context.js';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  Status,
  TEACHER_EDIT_DAYS,
  daysBetween,
  toDate,
  toIso,
  todayInIndia,
} from '../../attendance/attendance-rules.js';
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
  addHowTo,
  addTable,
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

interface Division {
  id: string;
  label: string;
  classId: string;
}

/** A student on a division's register for the month, and the days they were in it. */
interface OnRegister {
  studentId: string;
  admissionNo: string;
  name: string;
  /** Days of the month the student was in this division (enrolled, and had not left). */
  days: Set<string>;
  /** Day to academic year, for the days above. */
  yearOf: Map<string, string>;
}

interface RowData {
  studentId: string;
  divisionId: string;
  entries: { date: string; academicYearId: string; status: Status }[];
}

/** Excel sheet names: at most 31 characters, none of []:*?/\ . */
const sheetName = (name: string) =>
  name.replace(/[[\]:*?/\\]/g, '-').slice(0, 31);

/**
 * Student attendance from a monthly register: one sheet per division, students down the side,
 * the days across. The same rules as taking attendance on the screen: no future days, only
 * students in the division that day, and a teacher only their own divisions and the last week.
 * A blank box is never imported, so it never removes a mark.
 */
@Injectable()
export class StudentAttendanceImport implements ImportHandler {
  readonly kind = 'STUDENT_ATTENDANCE' as const;
  readonly permissions = ['attendance.mark'];
  readonly prefilled = true;

  constructor(private readonly prisma: PrismaService) {}

  private markAll(auth: AuthContext) {
    return auth.permissions.includes('attendance.mark_all');
  }

  /** The divisions this person may mark in the month (a teacher: those taught that year). */
  private async divisions(
    auth: AuthContext,
    month: string,
    wanted?: unknown,
  ): Promise<Division[]> {
    const rows = await this.prisma.division.findMany({
      where: { schoolId: auth.schoolId },
      select: {
        id: true,
        name: true,
        classId: true,
        class: { select: { name: true, sortOrder: true } },
      },
    });
    let allowed = rows;
    if (!this.markAll(auth)) {
      const years = await this.prisma.academicYear.findMany({
        where: {
          schoolId: auth.schoolId,
          startDate: { lte: toDate(monthDays(month).at(-1)!) },
          endDate: { gte: toDate(`${month}-01`) },
        },
        select: { id: true },
      });
      const where = {
        schoolId: auth.schoolId,
        academicYearId: { in: years.map((y) => y.id) },
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
      const taught = new Set(
        [...asClass, ...asSubject].map((r) => r.divisionId),
      );
      allowed = rows.filter((d) => taught.has(d.id));
    }
    if (typeof wanted === 'string' && wanted && wanted !== 'all') {
      allowed = allowed.filter((d) => d.id === wanted);
      // A division you may not use looks like one that does not exist.
      if (allowed.length === 0)
        throw new NotFoundException('Division not found');
    } else if (Array.isArray(wanted)) {
      allowed = allowed.filter((d) => wanted.includes(d.id));
    }
    return allowed
      .sort(
        (a, b) =>
          a.class.sortOrder - b.class.sortOrder || a.name.localeCompare(b.name),
      )
      .map((d) => ({
        id: d.id,
        label: `${d.class.name} - ${d.name}`,
        classId: d.classId,
      }));
  }

  /** Who was in a division during the month, and on which days. */
  private async register(
    divisionId: string,
    month: string,
  ): Promise<OnRegister[]> {
    const days = monthDays(month);
    const first = days[0];
    const last = days[days.length - 1];
    const enrolments = await this.prisma.enrollment.findMany({
      where: {
        divisionId,
        startedOn: { lte: toDate(last) },
        OR: [{ endedOn: null }, { endedOn: { gte: toDate(first) } }],
        student: { status: { not: 'REMOVED' } },
      },
      select: {
        startedOn: true,
        endedOn: true,
        academicYear: { select: { id: true, startDate: true, endDate: true } },
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            fatherName: true,
            surname: true,
            status: true,
            leftOn: true,
          },
        },
      },
    });
    const byStudent = new Map<string, OnRegister>();
    for (const e of enrolments) {
      const s = e.student;
      const r =
        byStudent.get(s.id) ??
        ({
          studentId: s.id,
          admissionNo: s.admissionNo,
          name: [s.firstName, s.fatherName, s.surname]
            .filter(Boolean)
            .join(' '),
          days: new Set<string>(),
          yearOf: new Map<string, string>(),
        } satisfies OnRegister);
      for (const d of days) {
        const inYear =
          toIso(e.academicYear.startDate) <= d &&
          d <= toIso(e.academicYear.endDate);
        const enrolled =
          toIso(e.startedOn) <= d && (!e.endedOn || toIso(e.endedOn) >= d);
        // The same rule as the screen: an active student, or one who left on or after that day.
        const here =
          s.status === 'ACTIVE' || (s.leftOn !== null && toIso(s.leftOn) >= d);
        if (inYear && enrolled && here) {
          r.days.add(d);
          r.yearOf.set(d, e.academicYear.id);
        }
      }
      byStudent.set(s.id, r);
    }
    return [...byStudent.values()]
      .filter((r) => r.days.size > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---------------------------------------------------------------------------
  // Template
  // ---------------------------------------------------------------------------

  async template(
    auth: AuthContext,
    input: Record<string, unknown>,
  ): Promise<Template> {
    const month = monthParam(input.month);
    const divisions = await this.divisions(
      auth,
      month,
      input.divisionIds ?? input.divisionId,
    );
    const days = monthDays(month);
    const wb = newWorkbook();
    addHowTo(
      wb,
      `Student attendance, ${monthTitle(month)}: how to fill this file`,
      [
        'One sheet per division. Each student has a row and each day a column, like the paper register.',
        'In each box write P (present), A (absent), L (late) or LV (on leave). Marks already in the app are filled in.',
        'Leave a box blank when attendance was not taken. A blank box changes nothing: it never removes a mark.',
        'Grey boxes cannot be marked: the student was not in the division that day, or the day has not come. Sundays and holidays are shaded lightly.',
        this.markAll(auth)
          ? 'You may fill in any past day.'
          : `Teachers may fill in only today and the last ${TEACHER_EDIT_DAYS} days; older days are for the school admin.`,
        '',
        'When you upload the file, nothing is saved at first: the app checks every box and shows what it found.',
      ],
    );
    const lists = new Lists(wb);
    const columns = registerColumns(
      [
        {
          key: 'admissionNo',
          header: 'Admission no',
          given: true,
          format: 'text',
          width: 13,
        },
        { key: 'name', header: 'Student', given: true, width: 26 },
      ],
      days,
      lists,
    );
    const marks = await this.existing(
      divisions.map((d) => d.id),
      days,
    );
    let sheets = 0;
    for (const division of divisions) {
      const register = await this.register(division.id, month);
      if (register.length === 0) continue;
      const rows: RowValues[] = register.map((r) => {
        const values: RowValues = { admissionNo: r.admissionNo, name: r.name };
        for (const d of days) {
          const m = marks.get(`${r.studentId}|${d}`);
          if (m && m.divisionId === division.id)
            values[dayKey(d)] = MARKS[m.status];
        }
        return values;
      });
      const ws = addTable(wb, sheetName(division.label), columns, rows, {
        prepared: rows.length,
        freezeColumns: 2,
      });
      shadeRegister(
        ws,
        columns,
        rows.length,
        (i, d) => !register[i].days.has(d),
        new Set(),
      );
      sheets++;
    }
    if (sheets === 0)
      throw new BadRequestException(
        `No students to mark in ${monthTitle(month)}`,
      );
    writeAbout(wb, {
      kind: this.kind,
      schoolId: auth.schoolId,
      params: { month, divisionIds: divisions.map((d) => d.id) },
    });
    const name =
      divisions.length === 1
        ? sheetName(divisions[0].label).replace(/\s+/g, '')
        : 'all';
    return { fileName: `attendance-${month}-${name}.xlsx`, workbook: wb };
  }

  private async existing(divisionIds: string[], days: string[]) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        divisionId: { in: divisionIds },
        date: { gte: toDate(days[0]), lte: toDate(days[days.length - 1]) },
      },
      select: { studentId: true, date: true, status: true, divisionId: true },
    });
    return new Map(records.map((r) => [`${r.studentId}|${toIso(r.date)}`, r]));
  }

  // ---------------------------------------------------------------------------
  // Check
  // ---------------------------------------------------------------------------

  async check(
    auth: AuthContext,
    wb: ExcelJS.Workbook,
    params: Record<string, unknown>,
  ): Promise<CheckResult> {
    const month = monthParam(params.month);
    const divisions = await this.divisions(auth, month, params.divisionIds);
    const days = monthDays(month);
    const today = todayInIndia();
    const marks = await this.existing(
      divisions.map((d) => d.id),
      days,
    );
    const tables = readTables(wb);
    const rows: CheckedRow[] = [];

    for (const division of divisions) {
      const table = tables.find((t) => t.sheet === sheetName(division.label));
      if (!table) continue;
      const register = new Map(
        (await this.register(division.id, month)).map((r) => [
          r.admissionNo.toLowerCase(),
          r,
        ]),
      );
      const seen = new Set<string>();
      for (const r of table.rows) {
        const row: CheckedRow = {
          sheet: r.sheet,
          rowNumber: r.rowNumber,
          label: `${division.label}, row ${r.rowNumber}`,
          values: r.values,
          errors: [],
          warnings: [],
        };
        rows.push(row);
        try {
          const who = register.get(asText(r.values.admissionNo).toLowerCase());
          if (!who) {
            row.errors.push(
              `${asText(r.values.admissionNo) || 'This row'} is not in ${division.label} in ${monthTitle(month)}`,
            );
            continue;
          }
          row.label = `${who.name}, ${division.label}`;
          if (seen.has(who.studentId)) {
            row.errors.push(`${who.name} appears twice`);
            continue;
          }
          seen.add(who.studentId);
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
            // A box that says what is already saved changes nothing, so no rule applies to it
            // (a teacher re-uploading a register is not refused for old marks left as they were).
            const now = marks.get(`${who.studentId}|${day}`);
            if (now?.status === mark.value && now.divisionId === division.id)
              continue;
            if (day > today)
              row.errors.push(`${showDay(day)} has not come yet`);
            else if (!who.days.has(day))
              row.errors.push(
                `${showDay(day)}: ${who.name} was not in ${division.label} that day`,
              );
            else if (
              !this.markAll(auth) &&
              daysBetween(day, today) > TEACHER_EDIT_DAYS
            )
              row.errors.push(
                `${showDay(day)} is more than ${TEACHER_EDIT_DAYS} days ago: only the school admin can change it`,
              );
            else {
              entries.push({
                date: day,
                academicYearId: who.yearOf.get(day)!,
                status: mark.value,
              });
            }
          }
          if (row.errors.length) continue;
          if (entries.length === 0) {
            row.unchanged = true;
            continue;
          }
          const data: RowData = {
            studentId: who.studentId,
            divisionId: division.id,
            entries,
          };
          row.data = data;
        } catch (error) {
          row.errors.push(messageOf(error));
        }
      }
    }
    return { params: { month, divisionIds: divisions.map((d) => d.id) }, rows };
  }

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------

  async run(
    auth: AuthContext,
    _batch: unknown,
    rows: CheckedRow[],
  ): Promise<void> {
    const today = todayInIndia();
    for (const row of rows) {
      const data = row.data as RowData;
      try {
        // A teacher's week may have moved on since the check.
        if (
          !this.markAll(auth) &&
          data.entries.some(
            (e) => daysBetween(e.date, today) > TEACHER_EDIT_DAYS,
          )
        ) {
          throw new BadRequestException(
            `Some days are now more than ${TEACHER_EDIT_DAYS} days ago: upload the file again`,
          );
        }
        await this.prisma.$transaction(
          data.entries.map((e) =>
            this.prisma.attendanceRecord.upsert({
              where: {
                studentId_date: {
                  studentId: data.studentId,
                  date: toDate(e.date),
                },
              },
              create: {
                schoolId: auth.schoolId,
                academicYearId: e.academicYearId,
                divisionId: data.divisionId,
                studentId: data.studentId,
                date: toDate(e.date),
                status: e.status,
                markedById: auth.userId,
              },
              update: {
                divisionId: data.divisionId,
                status: e.status,
                markedById: auth.userId,
              },
            }),
          ),
        );
        row.outcome = {
          status: 'IMPORTED',
          ref: { type: 'student', id: data.studentId },
        };
      } catch (error) {
        row.outcome = { status: 'FAILED', message: messageOf(error) };
      }
    }
  }
}
