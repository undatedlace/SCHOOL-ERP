/**
 * Pure rules for a teacher's own leave: how a request is counted (the same way as the API, so the
 * number shown before sending is the number the school will see), what is checked before it is
 * sent, and which requests can still be withdrawn. The API has the last word on every rule; what
 * is checked here only saves a round trip, and the server's message is shown when it refuses.
 */
import { addDays, daysBetween, formatDay, weekdayOf } from '@/lib/dates';

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: 'Waiting',
  APPROVED: 'Approved',
  REJECTED: 'Not approved',
  CANCELLED: 'Withdrawn',
};

export const STATUS_TONE: Record<LeaveStatus, 'warn' | 'good' | 'bad' | 'neutral'> = {
  PENDING: 'warn',
  APPROVED: 'good',
  REJECTED: 'bad',
  CANCELLED: 'neutral',
};

/** `GET /leave/types` */
export interface LeaveKind {
  id: string;
  name: string;
  unlimited: boolean;
  active: boolean;
  carryForwardDays: number;
}

/** One kind of leave in `GET /leave/balance`; all days are whole or half days. */
export interface BalanceRow {
  leaveType: { id: string; name: string; unlimited: boolean };
  entitled: number;
  carriedOver: number;
  taken: number;
  upcoming: number;
  pending: number;
  /** Null for a kind with no yearly limit. */
  remaining: number | null;
}

export interface LeaveBalance {
  staff: { id: string; name: string };
  academicYear: { id: string; name: string };
  balances: BalanceRow[];
}

/** `GET /leave/requests` item. */
export interface LeaveRequest {
  id: string;
  leaveType: { id: string; name: string };
  /** "YYYY-MM-DD" */
  startsOn: string;
  endsOn: string;
  halfDay: boolean;
  days: number;
  reason: string;
  status: LeaveStatus;
  decisionNote: string | null;
  createdAt: string;
  mine: boolean;
}

export interface LeavePage {
  items: LeaveRequest[];
  total: number;
  page: number;
  pageSize: number;
}

export const MAX_LEAVE_SPAN_DAYS = 120;
export const REASON_MIN = 3;
export const REASON_MAX = 300;
/** How far ahead the date boxes reach. The API only needs the request to sit inside one academic year. */
export const DAYS_AHEAD = 366;

// ---------- words ----------

/** "1 day", "2 days", "Half a day", "1½ days". */
export function daysText(days: number): string {
  if (days === 0.5) return 'Half a day';
  const whole = Math.floor(days);
  const half = days - whole === 0.5;
  const n = half ? `${whole}½` : String(whole);
  return `${n} ${days === 1 ? 'day' : 'days'}`;
}

/** The dates of a request: "Mon, 7 Dec" for one day, "7 Dec to 8 Dec" for several; "(half day)" when it is. */
export function requestDates(r: Pick<LeaveRequest, 'startsOn' | 'endsOn' | 'halfDay'>): string {
  const base = r.startsOn === r.endsOn ? formatDay(r.startsOn, 'short') : `${formatDay(r.startsOn, 'dayMonth')} to ${formatDay(r.endsOn, 'dayMonth')}`;
  return r.halfDay ? `${base} (half day)` : base;
}

// ---------- how a request is counted ----------

export interface LeavePreview {
  /** Days the request takes: Sundays and school holidays are not counted; a half day is 0.5. */
  days: number;
  sundays: number;
  holidays: number;
  /** Why the API would refuse it, or null. */
  problem: string | null;
}

/** The days a request takes, counted the way the API counts them. `holidays` are "YYYY-MM-DD" days. */
export function previewLeave(start: string, end: string, halfDay: boolean, holidays: ReadonlySet<string> = new Set()): LeavePreview {
  const none = (problem: string): LeavePreview => ({ days: 0, sundays: 0, holidays: 0, problem });
  if (end < start) return none('The last day cannot be before the first day');
  if (daysBetween(start, end) > MAX_LEAVE_SPAN_DAYS) return none(`A request can cover at most ${MAX_LEAVE_SPAN_DAYS} days`);
  if (halfDay && start !== end) return none('A half day is for a single day');
  let counted = 0;
  let sundays = 0;
  let off = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (weekdayOf(d) === 0) sundays++;
    else if (holidays.has(d)) off++;
    else counted++;
  }
  if (counted === 0) return { days: 0, sundays, holidays: off, problem: 'Those days are Sundays or school holidays, so there is nothing to take leave for' };
  return { days: halfDay ? 0.5 : counted, sundays, holidays: off, problem: null };
}

/** "2 days; a Sunday and 1 holiday not counted" */
export function previewSentence(p: LeavePreview): string {
  if (p.problem) return p.problem;
  const skipped: string[] = [];
  if (p.sundays > 0) skipped.push(p.sundays === 1 ? 'a Sunday' : `${p.sundays} Sundays`);
  if (p.holidays > 0) skipped.push(`${p.holidays} ${p.holidays === 1 ? 'holiday' : 'holidays'}`);
  return skipped.length ? `${daysText(p.days)}; ${skipped.join(' and ')} not counted` : daysText(p.days);
}

// ---------- checks before sending ----------

/** Leave that has to start today or later (an administrator records anything earlier). */
export function startProblem(start: string, today: string): string | null {
  return start < today ? 'Leave cannot start in the past. Ask an administrator to record it.' : null;
}

/** A sentence when the dates run into leave already asked for or approved. Withdrawn and refused leave is ignored. */
export function overlapProblem(requests: readonly Pick<LeaveRequest, 'startsOn' | 'endsOn' | 'status'>[], start: string, end: string): string | null {
  const clash = requests.some((r) => (r.status === 'PENDING' || r.status === 'APPROVED') && r.startsOn <= end && r.endsOn >= start);
  return clash ? 'There is already leave asked for or approved on some of those days' : null;
}

/** A warning when the request asks for more than is left. Advisory: the API decides. */
export function balanceWarning(row: BalanceRow | undefined, days: number): string | null {
  if (!row || row.remaining === null || days <= row.remaining) return null;
  const name = row.leaveType.name.toLowerCase();
  if (row.entitled + row.carriedOver === 0) return `There is no ${name} allowance this year`;
  return `Only ${daysText(row.remaining)} of ${name} ${row.remaining === 1 ? 'is' : 'are'} left, and this asks for ${daysText(days)}`;
}

/** What can still be withdrawn: waiting leave, or approved leave that has not started. */
export function canWithdraw(r: Pick<LeaveRequest, 'mine' | 'status' | 'startsOn'>, today: string): boolean {
  if (!r.mine) return false;
  if (r.status === 'PENDING') return true;
  return r.status === 'APPROVED' && r.startsOn > today;
}

// ---------- the form ----------

export interface LeaveDraft {
  leaveTypeId: string;
  /** "YYYY-MM-DD", or "" */
  startsOn: string;
  /** "YYYY-MM-DD", or "" for a single day. */
  endsOn: string;
  halfDay: boolean;
  reason: string;
}

export const emptyLeaveDraft = (): LeaveDraft => ({ leaveTypeId: '', startsOn: '', endsOn: '', halfDay: false, reason: '' });

export type LeaveErrors = Partial<Record<'leaveTypeId' | 'startsOn' | 'endsOn' | 'reason', string>>;

/** The last day in effect: a single day when none was chosen. */
export const effectiveEnd = (d: Pick<LeaveDraft, 'startsOn' | 'endsOn'>): string => d.endsOn || d.startsOn;

export function validateLeave(
  d: LeaveDraft,
  today: string,
  requests: readonly Pick<LeaveRequest, 'startsOn' | 'endsOn' | 'status'>[],
  holidays: ReadonlySet<string> = new Set(),
): LeaveErrors {
  const errors: LeaveErrors = {};
  if (!d.leaveTypeId) errors.leaveTypeId = 'Choose a kind of leave';
  if (!d.startsOn) errors.startsOn = 'Choose the first day';
  else {
    const problem = startProblem(d.startsOn, today);
    if (problem) errors.startsOn = problem;
    else {
      const end = effectiveEnd(d);
      const preview = previewLeave(d.startsOn, end, d.halfDay, holidays);
      if (preview.problem) errors[d.endsOn && end < d.startsOn ? 'endsOn' : 'startsOn'] = preview.problem;
      else {
        const clash = overlapProblem(requests, d.startsOn, end);
        if (clash) errors.startsOn = clash;
      }
    }
  }
  const reason = d.reason.trim();
  if (reason.length < REASON_MIN) errors.reason = 'Give a reason';
  else if (reason.length > REASON_MAX) errors.reason = `Keep the reason under ${REASON_MAX} letters`;
  return errors;
}

export const hasErrors = (e: object): boolean => Object.keys(e).length > 0;

/** The body of `POST /leave/requests`: the last day and the half day are left out unless used. */
export function requestBody(d: LeaveDraft): {
  leaveTypeId: string;
  startsOn: string;
  endsOn?: string;
  halfDay?: boolean;
  reason: string;
} {
  return {
    leaveTypeId: d.leaveTypeId,
    startsOn: d.startsOn,
    ...(d.endsOn && d.endsOn !== d.startsOn ? { endsOn: d.endsOn } : {}),
    ...(d.halfDay ? { halfDay: true } : {}),
    reason: d.reason.trim(),
  };
}

/** The holidays (for everyone or for staff) among calendar events, as a set of days. */
export function holidayDays(
  events: readonly { category: string; audience: string; startsOn: string; endsOn: string }[],
  from: string,
  to: string,
): Set<string> {
  const days = new Set<string>();
  for (const e of events) {
    if (e.category !== 'HOLIDAY' || (e.audience !== 'ALL' && e.audience !== 'STAFF')) continue;
    const start = e.startsOn < from ? from : e.startsOn;
    const end = e.endsOn > to ? to : e.endsOn;
    for (let d = start; d <= end; d = addDays(d, 1)) days.add(d);
  }
  return days;
}

export const REQUEST_FILTERS: readonly { value: LeaveStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Not approved' },
  { value: 'CANCELLED', label: 'Withdrawn' },
];
