import { StudentLeave, StudentLeaveStatus } from './student-leave.service';
import { formatDate } from '../../shared/dates';

export const STATUS_LABEL: Record<StudentLeaveStatus, string> = {
  PENDING: 'Waiting',
  APPROVED: 'Approved',
  REFUSED: 'Not approved',
  WITHDRAWN: 'Withdrawn',
};

export const STATUS_SEVERITY: Record<
  StudentLeaveStatus,
  'warn' | 'success' | 'danger' | 'secondary'
> = {
  PENDING: 'warn',
  APPROVED: 'success',
  REFUSED: 'danger',
  WITHDRAWN: 'secondary',
};

/** "1 day", "2 days", "Half a day". */
export function daysText(days: number): string {
  if (days === 0.5) return 'Half a day';
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** "5 Nov 2026" or "5 Nov 2026 to 7 Nov 2026". */
export function rangeText(r: Pick<StudentLeave, 'fromDate' | 'toDate'>): string {
  return r.fromDate === r.toDate
    ? formatDate(r.fromDate)
    : `${formatDate(r.fromDate)} to ${formatDate(r.toDate)}`;
}

/** "2 school days", "Half a school day": what a family sees before sending. */
export function schoolDaysText(days: number): string {
  if (days === 0.5) return 'Half a school day';
  return `${days} school day${days === 1 ? '' : 's'}`;
}
