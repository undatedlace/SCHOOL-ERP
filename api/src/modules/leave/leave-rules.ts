/**
 * Pure rules for staff leave (no database), so they are easy to test.
 *
 * Amounts are kept in half days (a day is 2, a half day is 1) so no decimals are ever added up.
 * Days are counted Monday to Saturday: Sundays are never counted.
 */
import { addDays, daysBetween } from '../attendance/attendance-rules.js';

export const HALF_DAYS_PER_DAY = 2;
/** The longest single request, in calendar days. */
export const MAX_LEAVE_SPAN_DAYS = 120;

const isSunday = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;

/** Every day from start to end (inclusive) that counts as a leave day (not a Sunday). */
export function leaveDates(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (!isSunday(d)) out.push(d);
  }
  return out;
}

export type LeaveSizeResult =
  { ok: true; halfDays: number } | { ok: false; problem: string };

/** How many half days a request takes, or what is wrong with it. */
export function leaveSize(
  start: string,
  end: string,
  halfDay: boolean,
): LeaveSizeResult {
  if (end < start)
    return {
      ok: false,
      problem: 'The last day cannot be before the first day',
    };
  if (daysBetween(start, end) > MAX_LEAVE_SPAN_DAYS) {
    return {
      ok: false,
      problem: `A request can cover at most ${MAX_LEAVE_SPAN_DAYS} days`,
    };
  }
  if (halfDay && start !== end) {
    return { ok: false, problem: 'A half day is for a single day' };
  }
  const days = leaveDates(start, end).length;
  if (days === 0)
    return {
      ok: false,
      problem: 'That is a Sunday, so there is nothing to take leave for',
    };
  return { ok: true, halfDays: halfDay ? 1 : days * HALF_DAYS_PER_DAY };
}

export interface Entitlement {
  leaveTypeId: string;
  staffTypeId: string | null;
  halfDays: number;
}

/** The yearly allowance for one kind of leave: the staff type's own row, else the general one, else none. */
export function entitledHalfDays(
  rows: Entitlement[],
  leaveTypeId: string,
  staffTypeId: string | null,
): number {
  const own =
    staffTypeId === null
      ? undefined
      : rows.find(
          (r) => r.leaveTypeId === leaveTypeId && r.staffTypeId === staffTypeId,
        );
  const general = rows.find(
    (r) => r.leaveTypeId === leaveTypeId && r.staffTypeId === null,
  );
  return (own ?? general)?.halfDays ?? 0;
}

export interface UsedLeave {
  status: 'PENDING' | 'APPROVED';
  /** The last day of the request. */
  endsOn: string;
  halfDays: number;
}

export interface Balance {
  entitled: number;
  /** Approved leave whose last day has passed. */
  taken: number;
  /** Approved leave still to come (or in progress). */
  upcoming: number;
  /** Asked for, waiting for an admin. */
  pending: number;
  /** What can still be asked for: entitled less everything taken, booked or waiting. */
  remaining: number;
}

export function balanceOf(
  entitled: number,
  used: UsedLeave[],
  today: string,
): Balance {
  let taken = 0;
  let upcoming = 0;
  let pending = 0;
  for (const u of used) {
    if (u.status === 'PENDING') pending += u.halfDays;
    else if (u.endsOn < today) taken += u.halfDays;
    else upcoming += u.halfDays;
  }
  return {
    entitled,
    taken,
    upcoming,
    pending,
    remaining: Math.max(0, entitled - taken - upcoming - pending),
  };
}

/** Whether two inclusive date ranges share a day. */
export const overlaps = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) => aStart <= bEnd && bStart <= aEnd;

/** Half days as a number of days for people: 3 -> 1.5. */
export const toDays = (halfDays: number) => halfDays / HALF_DAYS_PER_DAY;
/** A number of days (whole or .5) as half days, or null if it is not a multiple of a half. */
export function toHalfDays(days: number): number | null {
  const h = days * HALF_DAYS_PER_DAY;
  return Number.isInteger(h) && h >= 0 ? h : null;
}
