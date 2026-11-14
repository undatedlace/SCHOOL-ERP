import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type ExcelJS from 'exceljs';
import type { AuthContext } from '../../../common/auth-context.js';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  divisionLabel,
  TimetableData,
  type Booking,
} from '../../timetable/timetable-data.js';
import { WEEKDAY_NAMES } from '../../timetable/timetable-rules.js';
import { TimetableService } from '../../timetable/timetable.service.js';
import { asText, isBlank, matchKey } from '../cells.js';
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

const SHEET = 'Timetable';

interface RowData {
  divisionId: string;
  slotId: string;
  weekday: number;
  subjectId: string | null;
  /** undefined: use the subject teacher from Academic setup. */
  staffId: string | null | undefined;
  room: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A class's regular week from Excel: one row per division, day and period (filled in with what is
 * saved), where the school writes the subject, the teacher and the room. Blank subject and teacher
 * make a free period. Every box is checked like the grid editor, including clashes within the file.
 */
@Injectable()
export class TimetableImport implements ImportHandler {
  readonly kind = 'TIMETABLE' as const;
  readonly permissions = ['timetable.manage'];
  readonly prefilled = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly data: TimetableData,
    private readonly timetable: TimetableService,
  ) {}

  /** The class, its divisions and timings this year, and what is saved. */
  private async context(auth: AuthContext, input: Record<string, unknown>) {
    const classId = typeof input.classId === 'string' ? input.classId : '';
    if (!UUID.test(classId)) throw new BadRequestException('Choose a class');
    const year = await this.data.currentYear(auth.schoolId);
    const cls = await this.prisma.schoolClass.findFirst({
      where: { id: classId, schoolId: auth.schoolId },
      select: {
        id: true,
        name: true,
        divisions: {
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!cls) throw new NotFoundException('Class not found');
    const schedule = await this.data.scheduleOfClass(
      auth.schoolId,
      year.id,
      cls.id,
    );
    if (!schedule)
      throw new BadRequestException(
        `${cls.name} has no timings yet. Choose its timings in Timetable, Timings first.`,
      );
    const [entries, subjects, staff] = await Promise.all([
      this.prisma.timetableEntry.findMany({
        where: {
          schoolId: auth.schoolId,
          academicYearId: year.id,
          divisionId: { in: cls.divisions.map((d) => d.id) },
        },
        select: {
          divisionId: true,
          slotId: true,
          weekday: true,
          subjectId: true,
          staffId: true,
          room: true,
        },
      }),
      this.prisma.subject.findMany({
        where: { schoolId: auth.schoolId },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.staff.findMany({
        where: { schoolId: auth.schoolId },
        select: {
          id: true,
          firstName: true,
          surname: true,
          employeeNo: true,
          status: true,
        },
        orderBy: [{ firstName: 'asc' }, { surname: 'asc' }],
      }),
    ]);
    const periods = schedule.slots.filter((s) => s.kind !== 'BREAK');
    const divisions = cls.divisions.map((d) => ({
      ...d,
      class: { id: cls.id, name: cls.name },
    }));
    return {
      year,
      cls,
      schedule,
      periods,
      divisions,
      entries,
      subjects,
      staff,
    };
  }

  private static teacherText(s: {
    firstName: string;
    surname: string;
    employeeNo: string;
  }) {
    return `${s.firstName} ${s.surname} (${s.employeeNo})`;
  }

  async template(
    auth: AuthContext,
    input: Record<string, unknown>,
  ): Promise<Template> {
    const ctx = await this.context(auth, input);
    const wb = newWorkbook();
    addHowTo(
      wb,
      `Timetable for ${ctx.cls.name}, ${ctx.year.name}: how to fill this file`,
      [
        `One row for each division, day and period of the ${ctx.schedule.name} timings. Breaks are left out.`,
        'Write the subject and the teacher in each row; choose them from the drop-downs. What is saved in the app is filled in.',
        'Leave the teacher blank to use the subject teacher from Academic setup.',
        'Clear the subject and the teacher to make a free period.',
        'Grey columns come from the app; do not change them. Timings are changed in the app, not in this file.',
        'A teacher cannot be in two classes at overlapping times; such rows are refused and handed back.',
        '',
        'When you upload the file, nothing is saved at first: the app checks every row and shows what it found.',
      ],
    );
    const lists = new Lists(wb);
    const subjectList = lists.add(
      'Subjects',
      ctx.subjects.map((s) => s.name),
    );
    const teacherList = lists.add(
      'Teachers',
      ctx.staff
        .filter((s) => s.status === 'ACTIVE')
        .map((s) => TimetableImport.teacherText(s)),
    );
    const saved = new Map(
      ctx.entries.map((e) => [`${e.divisionId}|${e.slotId}|${e.weekday}`, e]),
    );
    const subjectName = new Map(ctx.subjects.map((s) => [s.id, s.name]));
    const staffById = new Map(ctx.staff.map((s) => [s.id, s]));
    const rows: RowValues[] = [];
    for (const d of ctx.divisions)
      for (let day = 1; day <= 6; day++)
        for (const slot of ctx.periods) {
          if (!slot.days.includes(day)) continue;
          const e = saved.get(`${d.id}|${slot.id}|${day}`);
          const teacher = e?.staffId ? staffById.get(e.staffId) : undefined;
          rows.push({
            division: d.name,
            day: WEEKDAY_NAMES[day],
            period: slot.label,
            time: `${slot.startsAt}–${slot.endsAt}`,
            subject: e?.subjectId
              ? (subjectName.get(e.subjectId) ?? null)
              : null,
            teacher: teacher ? TimetableImport.teacherText(teacher) : null,
            room: e?.room ?? null,
          });
        }
    addTable(
      wb,
      SHEET,
      [
        { key: 'division', header: 'Division', given: true, width: 10 },
        { key: 'day', header: 'Day', given: true, width: 12 },
        { key: 'period', header: 'Period', given: true, width: 14 },
        { key: 'time', header: 'Time', given: true, width: 14 },
        { key: 'subject', header: 'Subject', list: subjectList, width: 22 },
        {
          key: 'teacher',
          header: 'Teacher',
          list: teacherList,
          width: 30,
          note: 'Blank: the subject teacher from Academic setup.',
        },
        { key: 'room', header: 'Room', width: 14 },
      ],
      rows,
      { prepared: rows.length, freezeColumns: 4 },
    );
    writeAbout(wb, {
      kind: this.kind,
      schoolId: auth.schoolId,
      params: { classId: ctx.cls.id },
    });
    return {
      fileName: `timetable-${matchKey(ctx.cls.name) || 'class'}.xlsx`,
      workbook: wb,
    };
  }

  async check(
    auth: AuthContext,
    wb: ExcelJS.Workbook,
    params: Record<string, unknown>,
  ): Promise<CheckResult> {
    const ctx = await this.context(auth, params);
    const divisionByName = new Map(
      ctx.divisions.map((d) => [matchKey(d.name), d]),
    );
    const dayByName = new Map<string, number>();
    for (let d = 1; d <= 6; d++) {
      dayByName.set(matchKey(WEEKDAY_NAMES[d]), d);
      dayByName.set(matchKey(WEEKDAY_NAMES[d].slice(0, 3)), d);
    }
    const subjectByName = new Map<string, { id: string; name: string }>();
    for (const s of ctx.subjects) {
      subjectByName.set(matchKey(s.name), s);
      if (s.code) subjectByName.set(matchKey(s.code), s);
    }
    const staffByNo = new Map(
      ctx.staff.map((s) => [matchKey(s.employeeNo), s]),
    );
    const staffByName = new Map<string, (typeof ctx.staff)[number][]>();
    for (const s of ctx.staff) {
      const k = matchKey(`${s.firstName} ${s.surname}`);
      staffByName.set(k, [...(staffByName.get(k) ?? []), s]);
    }
    const saved = new Map(
      ctx.entries.map((e) => [`${e.divisionId}|${e.slotId}|${e.weekday}`, e]),
    );
    const subjectTeachers = await this.prisma.subjectTeacher.findMany({
      where: {
        schoolId: auth.schoolId,
        academicYearId: ctx.year.id,
        divisionId: { in: ctx.divisions.map((d) => d.id) },
      },
      select: {
        divisionId: true,
        subjectId: true,
        staffId: true,
        staff: { select: { status: true } },
      },
    });
    const usual = new Map(
      subjectTeachers
        .filter((s) => s.staff.status === 'ACTIVE')
        .map((s) => [`${s.divisionId}|${s.subjectId}`, s.staffId]),
    );

    const table = readTables(wb).find((t) => t.sheet === SHEET);
    const rows: CheckedRow[] = [];
    const seen = new Set<string>();
    const planned: { row: CheckedRow; booking: Booking }[] = [];
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
        const division = divisionByName.get(
          matchKey(asText(r.values.division)),
        );
        const weekday = dayByName.get(matchKey(asText(r.values.day)));
        if (!division) {
          row.errors.push(
            `${asText(r.values.division) || 'The division'} is not a division of ${ctx.cls.name}`,
          );
          continue;
        }
        if (!weekday) {
          row.errors.push(
            `${asText(r.values.day) || 'The day'} is not a day from Monday to Saturday`,
          );
          continue;
        }
        const label = matchKey(asText(r.values.period));
        const time = asText(r.values.time).replace(/\s/g, '').replace('-', '–');
        const matches = ctx.periods.filter(
          (s) => matchKey(s.label) === label && s.days.includes(weekday),
        );
        const slot =
          matches.length > 1
            ? matches.find((s) => `${s.startsAt}–${s.endsAt}` === time)
            : matches[0];
        if (!slot) {
          row.errors.push(
            `${asText(r.values.period) || 'The period'} is not a period of ${ctx.schedule.name} on ${WEEKDAY_NAMES[weekday]}`,
          );
          continue;
        }
        row.label = `${divisionLabel(division)}, ${WEEKDAY_NAMES[weekday]} ${slot.label}`;
        const key = `${division.id}|${slot.id}|${weekday}`;
        if (seen.has(key)) {
          row.errors.push(`${row.label} appears twice`);
          continue;
        }
        seen.add(key);

        let subjectId: string | null = null;
        if (!isBlank(r.values.subject)) {
          const s = subjectByName.get(matchKey(asText(r.values.subject)));
          if (!s)
            row.errors.push(
              `${asText(r.values.subject)} is not a subject; add it in Academic setup first`,
            );
          else subjectId = s.id;
        }
        let staffId: string | null | undefined;
        if (!isBlank(r.values.teacher)) {
          const text = asText(r.values.teacher);
          const no = /\(([^()]+)\)\s*$/.exec(text)?.[1] ?? text;
          const byName = staffByName.get(matchKey(text)) ?? [];
          const who =
            staffByNo.get(matchKey(no)) ??
            (byName.length === 1 ? byName[0] : undefined);
          if (!who)
            row.errors.push(
              byName.length > 1
                ? `Two members of staff are called ${text}; choose from the list`
                : `${text} is not a member of staff`,
            );
          else if (who.status !== 'ACTIVE')
            row.errors.push(`${who.firstName} ${who.surname} has left`);
          else staffId = who.id;
        } else if (!subjectId) {
          staffId = null;
        }
        if (slot.kind === 'ASSEMBLY' && subjectId)
          row.warnings.push(`${slot.label} is an assembly`);
        if (row.errors.length) continue;

        const room = isBlank(r.values.room)
          ? null
          : asText(r.values.room).slice(0, 40);
        const teacher =
          staffId === undefined
            ? subjectId
              ? (usual.get(`${division.id}|${subjectId}`) ?? null)
              : null
            : staffId;
        const before = saved.get(key);
        if (
          (before?.subjectId ?? null) === subjectId &&
          (before?.staffId ?? null) === teacher &&
          (before?.room ?? null) === room
        ) {
          row.unchanged = true;
          continue;
        }
        if (
          subjectId &&
          teacher &&
          usual.get(`${division.id}|${subjectId}`) &&
          usual.get(`${division.id}|${subjectId}`) !== teacher
        )
          row.warnings.push('Not the subject teacher in Academic setup');
        if (subjectId && !teacher)
          row.warnings.push(
            'No teacher: the subject has no subject teacher in Academic setup',
          );
        const data: RowData = {
          divisionId: division.id,
          slotId: slot.id,
          weekday,
          subjectId,
          staffId,
          room,
        };
        row.data = data;
        if (teacher)
          planned.push({
            row,
            booking: {
              staffId: teacher,
              weekday,
              startsAt: slot.startsAt,
              endsAt: slot.endsAt,
              divisionId: division.id,
              slotId: slot.id,
              where: row.label,
            },
          });
      } catch (error) {
        row.errors.push(messageOf(error));
      }
    }

    // Clashes, within the file and with other classes. Boxes in the file replace what is saved there.
    const staffIds = [...new Set(planned.map((p) => p.booking.staffId))];
    const inFile = new Set(
      rows.flatMap((r) =>
        r.data
          ? [
              `${(r.data as RowData).divisionId}|${(r.data as RowData).slotId}|${(r.data as RowData).weekday}`,
            ]
          : [],
      ),
    );
    const existing = (
      await this.data.bookings(auth.schoolId, ctx.year.id, staffIds)
    ).filter((b) => !inFile.has(`${b.divisionId}|${b.slotId}|${b.weekday}`));
    const names = new Map(
      ctx.staff.map((s) => [s.id, `${s.firstName} ${s.surname}`]),
    );
    for (const p of planned) {
      const others = [
        ...existing,
        ...planned.filter((q) => q !== p).map((q) => q.booking),
      ];
      const clash = this.data.clashes([p.booking], others, names);
      if (clash.length) {
        p.row.errors.push(...clash);
        p.row.data = undefined;
      }
    }
    return { params: { classId: ctx.cls.id }, rows };
  }

  async run(
    auth: AuthContext,
    _batch: unknown,
    rows: CheckedRow[],
  ): Promise<void> {
    const year = await this.data.currentYear(auth.schoolId);
    const divisions = new Map<
      string,
      { id: string; name: string; class: { id: string; name: string } }
    >();
    for (const row of rows) {
      const data = row.data as RowData;
      try {
        let division = divisions.get(data.divisionId);
        if (!division) {
          division = await this.prisma.division.findFirstOrThrow({
            where: { id: data.divisionId, schoolId: auth.schoolId },
            select: {
              id: true,
              name: true,
              class: { select: { id: true, name: true } },
            },
          });
          divisions.set(division.id, division);
        }
        const d = division;
        await this.prisma.$transaction(async (tx) => {
          await this.data.lock(tx, auth.schoolId, year.id);
          await this.timetable.writeEntries(tx, auth, year, d, [
            {
              slotId: data.slotId,
              weekday: data.weekday,
              subjectId: data.subjectId,
              staffId: data.staffId,
              room: data.room,
            },
          ]);
        });
        row.outcome = { status: 'IMPORTED' };
      } catch (error) {
        row.outcome = { status: 'FAILED', message: messageOf(error) };
      }
    }
  }
}
