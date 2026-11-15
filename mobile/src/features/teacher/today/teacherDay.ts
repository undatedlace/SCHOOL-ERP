/**
 * The teacher's own day from `GET /timetable/mine`: their lessons in every class, periods they
 * cover for someone else, lessons that are cancelled, and lessons another teacher takes for the
 * day. Pure functions (no clock, no React), so the rules are tested without a screen.
 */
import { addDays, minutesOf } from '@/lib/dates';
import { isoWeekday, type DayPlan, type TimelineRow } from '@/features/timetable/dayPlan';
import type { GridRow, PersonRef, SubjectRef, WeekDay } from '@/features/timetable/types';

export interface DivisionRef {
  id: string;
  label: string;
}

export interface TeacherCell {
  id: string;
  rowKey: string;
  slotId: string;
  /** ISO weekday, 1 Monday to 6 Saturday. */
  weekday: number;
  subject: SubjectRef | null;
  staff: PersonRef | null;
  room: string | null;
  division: DivisionRef;
}

export interface TeacherChange {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  rowKey: string;
  slotId: string;
  kind: 'SUBSTITUTE' | 'CANCELLED';
  division: DivisionRef;
  substitute: PersonRef | null;
  subject: SubjectRef | null;
  reason: string | null;
}

/** `GET /timetable/mine` */
export interface TeacherWeek {
  academicYear: { id: string; name: string };
  today: string;
  weekOf: string;
  days: WeekDay[];
  staff: PersonRef;
  rows: GridRow[];
  cells: TeacherCell[];
  changes: TeacherChange[];
  periodsPerWeek: number;
}

/**
 * The periods of one day for this teacher. A period appears when the teacher has a lesson in it
 * (it may be cancelled, or taken by a substitute) or covers it for someone else. Sundays,
 * holidays and days with no lesson at all give an empty plan.
 */
export function planTeacherDay(week: TeacherWeek | null | undefined, date: string): DayPlan {
  const weekday = isoWeekday(date);
  const holiday = week?.days.find((d) => d.date === date)?.holiday ?? null;
  if (weekday === 7) return { date, weekday, status: 'sunday', holiday, rows: [] };
  if (holiday) return { date, weekday, status: 'holiday', holiday, rows: [] };
  if (!week) return { date, weekday, status: 'no-lessons', holiday: null, rows: [] };

  const me = week.staff.id;
  const rows: TimelineRow[] = [];
  for (const row of week.rows) {
    if (!row.days.includes(weekday)) continue;
    const startMin = minutesOf(row.startsAt);
    const endMin = minutesOf(row.endsAt);
    if (startMin === null || endMin === null) continue;

    const own = week.cells.find((c) => c.rowKey === row.key && c.weekday === weekday);
    const changes = week.changes.filter((c) => c.rowKey === row.key && c.date === date);
    const cover = changes.find((c) => c.kind === 'SUBSTITUTE' && c.substitute?.id === me);
    const ownChange = own ? changes.find((c) => c.division.id === own.division.id && c !== cover) : undefined;

    const base = { key: row.key, kind: row.kind, label: row.label, startsAt: row.startsAt, endsAt: row.endsAt, startMin, endMin };

    if (cover && !own) {
      rows.push({
        ...base,
        subject: cover.subject?.name ?? null,
        teacher: null,
        room: null,
        free: false,
        change: { kind: 'SUBSTITUTE', substitute: week.staff.fullName },
        divisionId: cover.division.id,
        divisionLabel: cover.division.label,
        covering: true,
      });
      continue;
    }
    if (!own) continue;

    const takenBy = ownChange?.kind === 'SUBSTITUTE' ? ownChange.substitute?.fullName ?? 'another teacher' : null;
    rows.push({
      ...base,
      subject: ownChange?.subject?.name ?? own.subject?.name ?? null,
      teacher: null,
      room: own.room,
      free: !own.subject && !ownChange,
      change: ownChange ? { kind: ownChange.kind, substitute: takenBy } : null,
      divisionId: own.division.id,
      divisionLabel: own.division.label,
      coveredByOther: takenBy !== null,
    });
  }
  rows.sort((a, b) => a.startMin - b.startMin);
  return { date, weekday, status: rows.length === 0 ? 'no-lessons' : 'school', holiday: null, rows };
}

/** True when the teacher has to be in this lesson: not cancelled and not taken by someone else. */
export const isMyLesson = (r: TimelineRow): boolean =>
  r.kind === 'PERIOD' && !r.free && r.change?.kind !== 'CANCELLED' && r.coveredByOther !== true;

/** How many lessons the teacher teaches or covers on this day. */
export const lessonsToTeach = (plan: DayPlan): number => plan.rows.filter(isMyLesson).length;

/** Lessons that are cancelled, or that another teacher takes. */
export const lessonsAway = (plan: DayPlan): number => plan.rows.filter((r) => r.kind === 'PERIOD' && !isMyLesson(r) && !r.free).length;

/** Where the "Register" button of a lesson goes: that division's register, for that day. */
export function registerHref(row: Pick<TimelineRow, 'divisionId'>, date: string): string | null {
  return row.divisionId ? `/teacher/attendance/${row.divisionId}?date=${date}` : null;
}

/** Where the "Marks" button of a lesson goes: the list of tests for that division. */
export function marksHref(row: Pick<TimelineRow, 'divisionId'>): string {
  return row.divisionId ? `/teacher/marks?divisionId=${row.divisionId}` : '/teacher/marks';
}

/** "Nursery-A, 9:20 am": the line under the Lessons tile. */
export function nextLessonText(next: { row: TimelineRow; when: 'now' | 'next' } | null, clock: (hhmm: string) => string): string | null {
  if (!next) return null;
  const where = next.row.divisionLabel ?? next.row.label;
  return next.when === 'now' ? `Now: ${where}` : `Next: ${where}, ${clock(next.row.startsAt)}`;
}

export interface NextLesson {
  date: string;
  row: TimelineRow;
}

/**
 * The teacher's next lesson in one division, looking from now to the end of the week the data
 * covers: later today, or on a following day. Null when there is none left this week.
 */
export function nextLessonIn(
  week: TeacherWeek | null | undefined,
  divisionId: string,
  today: string,
  nowMin: number,
): NextLesson | null {
  if (!week) return null;
  const lastDay = week.days[week.days.length - 1]?.date ?? today;
  for (let date = today; date <= lastDay; date = addDays(date, 1)) {
    if (date < week.weekOf) continue;
    const plan = planTeacherDay(week, date);
    const row = plan.rows.find((r) => r.divisionId === divisionId && isMyLesson(r) && (date > today || r.endMin > nowMin));
    if (row) return { date, row };
  }
  return null;
}
