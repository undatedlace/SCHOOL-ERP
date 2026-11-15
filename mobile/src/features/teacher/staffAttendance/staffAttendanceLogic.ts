/**
 * Pure helpers for a teacher's own attendance (`GET /staff-attendance/me`): the month asked for,
 * turning the answer into the same records the student month grid draws, and the counts for the
 * days that have happened. Approved leave arrives in the answer's `days` as ON_LEAVE for days
 * nobody marked by hand, so a leave day reads "On leave" without anything extra here.
 */
import {
  firstOfMonth,
  lastOfMonth,
  monthOf,
  shiftMonth,
  summarise,
  tally,
  type AttendanceRecord,
  type AttendanceStatus,
  type Summary,
} from '@/features/attendance/attendanceLogic';

export { monthOf, shiftMonth };

/** How many months back a teacher can look. */
export const MONTHS_BACK = 12;

export interface StaffAttendanceAnswer {
  from: string;
  to: string;
  daysMarked: number;
  markedDates: string[];
  people: {
    staffId: string;
    name: string;
    designation: string;
    present: number;
    absent: number;
    late: number;
    onLeave: number;
    days: Record<string, AttendanceStatus>;
  }[];
  /** Only the days the school marked by hand, with their notes (no leave days). */
  records: { date: string; status: AttendanceStatus; note: string | null }[];
}

/** The first and last day to ask for when looking at a month ("YYYY-MM"). */
export function monthRange(month: string): { from: string; to: string } {
  return { from: firstOfMonth(month), to: lastOfMonth(month) };
}

/** Whether the arrows may step from a month: not before a year ago, not past this month. */
export function canStep(month: string, by: -1 | 1, today: string): boolean {
  const target = shiftMonth(month, by);
  const now = monthOf(today);
  return target <= now && target >= shiftMonth(now, -MONTHS_BACK);
}

/**
 * Every day with a status for the person asked about: marked days with their notes, and leave
 * days as ON_LEAVE. Oldest first.
 */
export function recordsFromAnswer(answer: StaffAttendanceAnswer | undefined): AttendanceRecord[] {
  const person = answer?.people[0];
  if (!answer || !person) return [];
  const notes = new Map(answer.records.map((r) => [r.date, r.note]));
  return Object.entries(person.days)
    .map(([date, status]) => ({ date, status, note: notes.get(date) ?? null }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Counts for the days up to and including today (leave booked for later is not counted yet). */
export function summaryUpTo(records: readonly AttendanceRecord[], today: string): Summary {
  return summarise(tally(records.filter((r) => r.date <= today)));
}

/** Later days that already carry approved leave, for a note under the grid. */
export function upcomingLeave(records: readonly AttendanceRecord[], today: string): number {
  return records.filter((r) => r.date > today && r.status === 'ON_LEAVE').length;
}
