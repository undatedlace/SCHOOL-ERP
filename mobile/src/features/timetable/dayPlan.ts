/**
 * Pure logic for the timetable timeline: which periods a day has, which are done, now or next,
 * and where the live "now" line sits. No clock and no React in here (the caller passes the day
 * and the minutes since midnight in India), so it is easy to test.
 */
import { minutesOf, weekdayOf } from '@/lib/dates';
import type { DivisionWeek, SlotKind } from './types';

export interface TimelineRow {
  key: string;
  kind: SlotKind;
  label: string;
  /** "HH:mm" */
  startsAt: string;
  endsAt: string;
  startMin: number;
  endMin: number;
  subject: string | null;
  teacher: string | null;
  room: string | null;
  /** A period with nothing in its box. */
  free: boolean;
  /** One-day change, if any. */
  change: { kind: 'SUBSTITUTE' | 'CANCELLED'; substitute: string | null } | null;
  /** A teacher's own day only: the class this lesson is with ("Nursery-A") and its id. */
  divisionId?: string;
  divisionLabel?: string;
  /** A teacher's own day only: a period the teacher covers for someone else. */
  covering?: boolean;
  /** A teacher's own day only: the teacher's lesson, taken by another teacher for the day. */
  coveredByOther?: boolean;
}

export type DayStatus = 'school' | 'holiday' | 'sunday' | 'no-lessons';

export interface DayPlan {
  date: string;
  /** ISO weekday: 1 Monday to 7 Sunday. */
  weekday: number;
  status: DayStatus;
  holiday: string | null;
  rows: TimelineRow[];
}

/** ISO weekday (1 Monday to 7 Sunday) of a "YYYY-MM-DD" day. */
export function isoWeekday(date: string): number {
  const w = weekdayOf(date);
  return w === 0 ? 7 : w;
}

/**
 * The periods of one day from a week the API sent. `week` may be null (still loading or no
 * timings yet): the plan then has no rows.
 */
export function planDay(week: DivisionWeek | null | undefined, date: string): DayPlan {
  const weekday = isoWeekday(date);
  const holiday = week?.days.find((d) => d.date === date)?.holiday ?? null;
  if (weekday === 7) return { date, weekday, status: 'sunday', holiday, rows: [] };
  if (holiday) return { date, weekday, status: 'holiday', holiday, rows: [] };
  if (!week) return { date, weekday, status: 'no-lessons', holiday: null, rows: [] };

  const rows: TimelineRow[] = [];
  for (const row of week.rows) {
    if (!row.days.includes(weekday)) continue;
    const startMin = minutesOf(row.startsAt);
    const endMin = minutesOf(row.endsAt);
    if (startMin === null || endMin === null) continue;
    const cell =
      row.kind === 'PERIOD' ? week.cells.find((c) => c.rowKey === row.key && c.weekday === weekday) : undefined;
    const change = week.changes.find((c) => c.rowKey === row.key && c.date === date);
    const cancelled = change?.kind === 'CANCELLED';
    const substitute = change?.kind === 'SUBSTITUTE' ? change.substitute?.fullName ?? null : null;
    const subject = change?.subject?.name ?? cell?.subject?.name ?? null;
    rows.push({
      key: row.key,
      kind: row.kind,
      label: row.label,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      startMin,
      endMin,
      subject,
      teacher: substitute ?? cell?.staff?.fullName ?? null,
      room: cell?.room ?? null,
      free: row.kind === 'PERIOD' && !subject && !cancelled && !change,
      change: change ? { kind: change.kind, substitute } : null,
    });
  }
  rows.sort((a, b) => a.startMin - b.startMin);
  return { date, weekday, status: rows.length === 0 ? 'no-lessons' : 'school', holiday: null, rows };
}

export type RowState = 'done' | 'now' | 'next' | 'later';

const isLesson = (r: TimelineRow) =>
  r.kind === 'PERIOD' && !r.free && r.change?.kind !== 'CANCELLED' && !r.coveredByOther;

/**
 * Done, now, next or later for every row of a day. Days before today are all done and days
 * after are all later. On today, a row is "now" while the clock is inside it; the first lesson
 * still to come (not a break, not free, not cancelled) is "next".
 */
export function rowStates(rows: TimelineRow[], date: string, today: string, nowMin: number): RowState[] {
  if (date < today) return rows.map(() => 'done');
  if (date > today) return rows.map(() => 'later');
  let nextTaken = false;
  return rows.map((r) => {
    if (r.endMin <= nowMin) return 'done';
    if (r.startMin <= nowMin) return 'now';
    if (!nextTaken && isLesson(r)) {
      nextTaken = true;
      return 'next';
    }
    return 'later';
  });
}

export interface NowLine {
  /** The row the line is in (inside = true) or sits just above (inside = false). */
  index: number;
  inside: boolean;
  /** 0 to 1 down the row; 0 when the line sits between rows. */
  fraction: number;
}

/** Where the live line goes, or null before the first row, after the last, or on another day. */
export function nowLine(rows: TimelineRow[], date: string, today: string, nowMin: number): NowLine | null {
  if (date !== today || rows.length === 0) return null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (nowMin >= r.startMin && nowMin < r.endMin) {
      const span = Math.max(1, r.endMin - r.startMin);
      return { index: i, inside: true, fraction: (nowMin - r.startMin) / span };
    }
    if (nowMin < r.startMin) {
      return i === 0 ? null : { index: i, inside: false, fraction: 0 };
    }
  }
  return null;
}

export interface UpNext {
  row: TimelineRow;
  /** "now" while it is running, "next" when it is still to come. */
  when: 'now' | 'next';
  /** Minutes until it starts (next) or ends (now). */
  minutes: number;
}

/** The lesson running now, or the next one today. Null on other days, or when school is over. */
export function upNext(rows: TimelineRow[], date: string, today: string, nowMin: number): UpNext | null {
  if (date !== today) return null;
  for (const r of rows) {
    if (!isLesson(r) || r.endMin <= nowMin) continue;
    return r.startMin <= nowMin
      ? { row: r, when: 'now', minutes: r.endMin - nowMin }
      : { row: r, when: 'next', minutes: r.startMin - nowMin };
  }
  return null;
}

/** True when it is today, there were rows, and the last one has ended. */
export function schoolIsOver(rows: TimelineRow[], date: string, today: string, nowMin: number): boolean {
  return date === today && rows.length > 0 && rows[rows.length - 1]!.endMin <= nowMin;
}

/** "in 12 min", "in 1 h 5 min" for a number of minutes. */
export function minutesText(minutes: number): string {
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
