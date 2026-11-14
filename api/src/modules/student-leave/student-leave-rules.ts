/**
 * Pure rules for student leave ("Report absence"), no database. A day is counted unless it is a Sunday
 * or a school holiday; a half day is 0.5. There is no allowance, so nothing here is a balance.
 */
import { addDays, daysBetween } from '../attendance/attendance-rules.js';

/** How far ahead of today a request may reach. */
export const MAX_DAYS_AHEAD = 60;

const isSunday = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;

export interface SkippedDay {
  date: string;
  reason: 'SUNDAY' | 'HOLIDAY';
}

export interface Counted {
  /** The days that count, "YYYY-MM-DD". */
  dates: string[];
  /** Sundays and school holidays inside the range. */
  skipped: SkippedDay[];
  /** The counted days: a half day is 0.5. */
  days: number;
}

/** Splits the range into counted days and skipped Sundays and holidays (a Sunday that is also a holiday is a Sunday). */
export function countDays(
  from: string,
  to: string,
  halfDay: boolean,
  holidays: ReadonlySet<string> = new Set(),
): Counted {
  const dates: string[] = [];
  const skipped: SkippedDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isSunday(d)) skipped.push({ date: d, reason: 'SUNDAY' });
    else if (holidays.has(d)) skipped.push({ date: d, reason: 'HOLIDAY' });
    else dates.push(d);
  }
  return {
    dates,
    skipped,
    days: halfDay && dates.length > 0 ? 0.5 : dates.length,
  };
}

/** What is wrong with the dates themselves (null when they are fine). Today is allowed; the past is not. */
export function windowProblem(
  from: string,
  to: string,
  halfDay: boolean,
  today: string,
): string | null {
  if (to < from) return 'The last day cannot be before the first day';
  if (from < today) return 'The first day cannot be in the past';
  if (daysBetween(today, to) > MAX_DAYS_AHEAD) {
    return `A request can reach at most ${MAX_DAYS_AHEAD} days ahead`;
  }
  if (halfDay && from !== to) return 'A half day is for a single day';
  return null;
}

/** Whether two inclusive date ranges share a day. */
export const overlaps = (
  aFrom: string,
  aTo: string,
  bFrom: string,
  bTo: string,
) => aFrom <= bTo && bFrom <= aTo;

/** Whether a request covers a day. */
export const covers = (from: string, to: string, day: string) =>
  from <= day && day <= to;
