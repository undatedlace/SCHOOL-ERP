import {
  AttendanceDivisionReport,
  AttendanceRoster,
  AttendanceStatus,
  AttendanceSummary,
} from '../../core/models';
import { fromIsoDate, toIsoDate } from '../../shared/dates';

export const STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LATE', label: 'Late' },
  { value: 'ON_LEAVE', label: 'Leave' },
];

export const statusLabel = (s: AttendanceStatus) => STATUSES.find((x) => x.value === s)?.label ?? s;

/** What the teacher has chosen so far, by student. */
export type Drafts = Record<string, { status: AttendanceStatus | null; note: string }>;

export const draftsFrom = (roster: AttendanceRoster): Drafts =>
  Object.fromEntries(
    roster.students.map((s) => [s.studentId, { status: s.status, note: s.note ?? '' }]),
  );

/** The students whose mark differs from what is saved: only these are sent. */
export function changes(roster: AttendanceRoster, drafts: Drafts) {
  const out: { studentId: string; status: AttendanceStatus; note?: string }[] = [];
  for (const s of roster.students) {
    const d = drafts[s.studentId];
    if (!d?.status) continue;
    const note = d.note.trim();
    if (d.status === s.status && note === (s.note ?? '')) continue;
    out.push({ studentId: s.studentId, status: d.status, ...(note ? { note } : {}) });
  }
  return out;
}

export const unmarkedCount = (roster: AttendanceRoster, drafts: Drafts) =>
  roster.students.filter((s) => !drafts[s.studentId]?.status).length;

/** "92.5%", or a dash before anything has been counted. */
export const percentText = (s: Pick<AttendanceSummary, 'percent'>) =>
  s.percent === null ? '-' : `${s.percent}%`;

/** Below this a child's attendance is called out. */
export const LOW_PERCENT = 75;
export const isLow = (s: Pick<AttendanceSummary, 'percent'>) =>
  s.percent !== null && s.percent < LOW_PERCENT;

// ---------- The attendance grid (students down, days across) ----------

/** Longest range drawn with every day as a column. Longer ranges show only the days taken. */
export const GRID_MAX_DAYS = 31;

export interface GridDay {
  iso: string;
  /** "08" */
  day: string;
  /** "Mon" */
  weekday: string;
  /** Sunday: no school, drawn greyed. */
  sunday: boolean;
  /** Attendance was taken for the division on this day. */
  taken: boolean;
}

/** The columns of the grid: every day of a short range, or just the days taken for a long one. */
export function gridDays(
  report: Pick<AttendanceDivisionReport, 'from' | 'to' | 'markedDates'>,
): GridDay[] {
  const taken = new Set(report.markedDates);
  const make = (iso: string): GridDay => {
    const d = fromIsoDate(iso);
    return {
      iso,
      day: String(d.getDate()).padStart(2, '0'),
      weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      sunday: d.getDay() === 0,
      taken: taken.has(iso),
    };
  };
  const all: string[] = [];
  const start = fromIsoDate(report.from);
  const end = fromIsoDate(report.to);
  for (
    let d = start;
    d <= end && all.length <= GRID_MAX_DAYS;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    all.push(toIsoDate(d));
  }
  return (all.length <= GRID_MAX_DAYS ? all : report.markedDates).map(make);
}

export interface Mark {
  /** One or two letters shown inside the circle, so the shape and letter carry the meaning. */
  symbol: string;
  label: string;
  /** Tailwind classes for the circle. */
  tone: string;
}

export const MARKS: Record<AttendanceStatus, Mark> = {
  PRESENT: { symbol: '✓', label: 'Present', tone: 'bg-sky-400 text-white' },
  ABSENT: { symbol: '✕', label: 'Absent', tone: 'bg-red-500 text-white' },
  LATE: { symbol: 'L', label: 'Late', tone: 'bg-amber-400 text-black' },
  ON_LEAVE: { symbol: 'Lv', label: 'On leave', tone: 'bg-zinc-400 text-black' },
};

/** First and last day of the month a day is in, and of the month before it. */
export function monthBounds(iso: string, monthsBack = 0): { from: string; to: string } {
  const d = fromIsoDate(iso);
  const first = new Date(d.getFullYear(), d.getMonth() - monthsBack, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return { from: toIsoDate(first), to: toIsoDate(last) };
}
