/**
 * Pure rules for the attendance screens: the percentage (same rule as the API in
 * `api/src/modules/attendance/attendance-rules.ts`), ranges, and the month grid.
 */
import { addDays, daysBetween, weekdayOf } from '@/lib/dates';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'ON_LEAVE';

export interface AttendanceRecord {
  /** "YYYY-MM-DD" */
  date: string;
  status: AttendanceStatus;
  note: string | null;
}

/** `GET /attendance/students/:id` */
export interface AttendanceHistory {
  studentId: string;
  from: string;
  to: string;
  summary: Summary;
  records: AttendanceRecord[];
}

export interface Counts {
  present: number;
  late: number;
  absent: number;
  onLeave: number;
}

export interface Summary extends Counts {
  markedDays: number;
  countedDays: number;
  attendedDays: number;
  /** One decimal, or null when no day counts yet. */
  percent: number | null;
}

/** Under this percentage the screens call attendance "Low" (open decision 16: 75%). */
export const LOW_PERCENT = 75;

export const isLow = (percent: number | null): boolean => percent !== null && percent < LOW_PERCENT;

export function tally(records: readonly Pick<AttendanceRecord, 'status'>[]): Counts {
  const c: Counts = { present: 0, late: 0, absent: 0, onLeave: 0 };
  for (const r of records) {
    if (r.status === 'PRESENT') c.present++;
    else if (r.status === 'LATE') c.late++;
    else if (r.status === 'ABSENT') c.absent++;
    else c.onLeave++;
  }
  return c;
}

/**
 * Present and late count as attended; approved leave is left out of both sides, so a child on
 * leave is not penalised. 18 attended of 20 counted days is 90.0%.
 */
export function summarise(counts: Counts): Summary {
  const attendedDays = counts.present + counts.late;
  const countedDays = attendedDays + counts.absent;
  return {
    ...counts,
    markedDays: countedDays + counts.onLeave,
    countedDays,
    attendedDays,
    percent: countedDays === 0 ? null : Math.round((attendedDays * 1000) / countedDays) / 10,
  };
}

export type RangeKey = 'year' | 'thisMonth' | 'lastMonth';

/** "YYYY-MM" of a "YYYY-MM-DD" day. */
export const monthOf = (day: string): string => day.slice(0, 7);

/** The month before or after "YYYY-MM". */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) + by;
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export const firstOfMonth = (month: string): string => `${month}-01`;

export function lastOfMonth(month: string): string {
  return addDays(firstOfMonth(shiftMonth(month, 1)), -1);
}

/** The first and last day a range covers, given today and where the school year starts. */
export function rangeDays(key: RangeKey, today: string, yearStart: string): { from: string; to: string } {
  if (key === 'year') return { from: yearStart, to: today };
  const month = key === 'thisMonth' ? monthOf(today) : shiftMonth(monthOf(today), -1);
  return { from: firstOfMonth(month), to: key === 'thisMonth' ? today : lastOfMonth(month) };
}

export function recordsIn(records: readonly AttendanceRecord[], from: string, to: string): AttendanceRecord[] {
  return records.filter((r) => r.date >= from && r.date <= to);
}

export interface GridCell {
  /** "YYYY-MM-DD", or null for the blank boxes before the 1st and after the last day. */
  date: string | null;
  day: number | null;
  status: AttendanceStatus | null;
  isToday: boolean;
  isFuture: boolean;
  isSunday: boolean;
}

/** A month as rows of seven boxes, Monday first. */
export function monthGrid(month: string, records: readonly AttendanceRecord[], today: string): GridCell[][] {
  const byDate = new Map(records.map((r) => [r.date, r.status]));
  const first = firstOfMonth(month);
  const last = lastOfMonth(month);
  const lead = (weekdayOf(first) + 6) % 7; // Monday = 0
  const cells: GridCell[] = [];
  for (let i = 0; i < lead; i++) cells.push(blank());
  for (let n = 0; n <= daysBetween(first, last); n++) {
    const date = addDays(first, n);
    cells.push({
      date,
      day: n + 1,
      status: byDate.get(date) ?? null,
      isToday: date === today,
      isFuture: date > today,
      isSunday: weekdayOf(date) === 0,
    });
  }
  while (cells.length % 7 !== 0) cells.push(blank());
  const rows: GridCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

const blank = (): GridCell => ({ date: null, day: null, status: null, isToday: false, isFuture: false, isSunday: false });

/** The letter on a grid box and the word for it. Colour is never the only cue. */
export const STATUS_MARK: Record<AttendanceStatus, { letter: string; label: string }> = {
  PRESENT: { letter: 'P', label: 'Present' },
  ABSENT: { letter: 'A', label: 'Absent' },
  LATE: { letter: 'L', label: 'Late' },
  ON_LEAVE: { letter: 'Lv', label: 'On leave' },
};

/** Days that were not "present", newest first. */
export function notPresent(records: readonly AttendanceRecord[]): AttendanceRecord[] {
  return records.filter((r) => r.status !== 'PRESENT').sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
