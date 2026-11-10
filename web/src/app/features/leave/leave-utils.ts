import { LeaveStatus } from '../../core/models';

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: 'Waiting',
  APPROVED: 'Approved',
  REJECTED: 'Refused',
  CANCELLED: 'Withdrawn',
};

export const STATUS_SEVERITY: Record<LeaveStatus, 'warn' | 'success' | 'danger' | 'secondary'> = {
  PENDING: 'warn',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'secondary',
};

/** "1.5" days as "1 and a half days", "0.5" as "Half a day". */
export function daysText(days: number): string {
  if (days === 0.5) return 'Half a day';
  const whole = Math.floor(days);
  const half = days - whole === 0.5;
  if (!half) return `${days} day${days === 1 ? '' : 's'}`;
  return `${whole} and a half days`;
}

/** Parses what someone typed as a number of days: whole or half, or null when it is not one. */
export function parseDays(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 366) return null;
  return Number.isInteger(n * 2) ? n : null;
}

/** Whether withdrawing is worth offering: waiting leave, or approved leave that has not ended. */
export const canWithdraw = (status: LeaveStatus, endsOn: string, today: string) =>
  status === 'PENDING' || (status === 'APPROVED' && endsOn >= today);
