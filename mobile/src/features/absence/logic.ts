import { addDays, formatDay, weekdayOf } from '@/lib/dates';

/** Shapes from `docs/student-leave.md`. */
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REFUSED' | 'WITHDRAWN';

export interface StudentLeave {
  id: string;
  student: { id: string; name: string; className: string | null; divisionName: string | null };
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  days: number;
  reason: string;
  status: LeaveStatus;
  requestedBy: { name: string | null } | null;
  decidedBy: { name: string | null } | null;
  decidedAt: string | null;
  decisionNote: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  canWithdraw: boolean;
  canDecide: boolean;
}

export interface LeaveList {
  items: StudentLeave[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<LeaveStatus, number>;
}

export interface LeavePreview {
  studentId?: string;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  days: number;
  countedDates: string[];
  skipped: { date: string; reason: 'SUNDAY' | 'HOLIDAY' | string }[];
  problem: string | null;
}

/** How far ahead a request may start (the API's own limit). */
export const MAX_DAYS_AHEAD = 60;
export const MAX_REASON = 500;

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: 'Waiting',
  APPROVED: 'Approved',
  REFUSED: 'Not approved',
  WITHDRAWN: 'Withdrawn',
};

export const STATUS_TONE: Record<LeaveStatus, 'warn' | 'good' | 'bad' | 'neutral'> = {
  PENDING: 'warn',
  APPROVED: 'good',
  REFUSED: 'bad',
  WITHDRAWN: 'neutral',
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "2 school days" or "Half a school day". */
export function daysLabel(days: number): string {
  if (days === 0.5) return 'Half a school day';
  return `${days} school ${plural(days, 'day', 'days')}`;
}

/**
 * The sentence under the dates: "2 school days; Sunday and 1 holiday not counted".
 * When the API says why the request cannot be made (`problem`), that is the sentence.
 */
export function previewSentence(p: Pick<LeavePreview, 'days' | 'skipped' | 'problem'>): { text: string; ok: boolean } {
  if (p.problem) return { text: p.problem, ok: false };
  const sundays = p.skipped.filter((s) => s.reason === 'SUNDAY').length;
  const holidays = p.skipped.filter((s) => s.reason === 'HOLIDAY').length;
  const notCounted: string[] = [];
  if (sundays > 0) notCounted.push(sundays === 1 ? 'Sunday' : `${sundays} Sundays`);
  if (holidays > 0) notCounted.push(`${holidays} ${plural(holidays, 'holiday', 'holidays')}`);
  const base = daysLabel(p.days);
  return {
    text: notCounted.length ? `${base}; ${notCounted.join(' and ')} not counted` : base,
    ok: true,
  };
}

/** "Mon, 16 Nov" for one day, "16 Nov to 18 Nov" for several; "(half day)" when it is. */
export function rangeLabel(from: string, to: string, halfDay: boolean): string {
  const base = from === to ? formatDay(from, 'short') : `${formatDay(from, 'dayMonth')} to ${formatDay(to, 'dayMonth')}`;
  return halfDay ? `${base} (half day)` : base;
}

/** Days in a month (month is 1 to 12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * A month as weeks of seven cells, Monday first. A cell is a "YYYY-MM-DD" day or null (a gap
 * before the 1st or after the last day).
 */
export function monthCells(year: number, month: number): (string | null)[][] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const first = `${year}-${pad(month)}-01`;
  const lead = (weekdayOf(first) + 6) % 7; // Monday = 0
  const total = daysInMonth(year, month);
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= total; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** The month before or after (month is 1 to 12). */
export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The first and last day that can be chosen as the first day of a request. */
export function firstDayRange(today: string): { min: string; max: string } {
  return { min: today, max: addDays(today, MAX_DAYS_AHEAD) };
}

/** The last day can be the first day, up to as far as a request may reach. */
export function lastDayRange(from: string): { min: string; max: string } {
  return { min: from, max: addDays(from, MAX_DAYS_AHEAD) };
}
