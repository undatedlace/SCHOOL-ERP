/**
 * Pure rules for the teacher's register: what is chosen so far, the counts, "mark everyone
 * present", the pre-selected leave, which students are sent on save, and which days a teacher may
 * still change. No React and no clock (the caller passes "today"), so it is all tested.
 */
import { addDays, daysBetween, formatDay, weekdayOf } from '@/lib/dates';
import { LOW_PERCENT, summarise, type AttendanceStatus } from '@/features/attendance/attendanceLogic';

export type { AttendanceStatus };

/** A teacher may mark or correct a day this many days back (`TEACHER_EDIT_DAYS` in the API). */
export const TEACHER_EDIT_DAYS = 7;

export const NOTE_MAX = 200;
export const LEAVE_NOTE = 'Leave approved';

export const STATUS_OPTIONS: readonly { value: AttendanceStatus; label: string; letter: string }[] = [
  { value: 'PRESENT', label: 'Present', letter: 'P' },
  { value: 'ABSENT', label: 'Absent', letter: 'A' },
  { value: 'LATE', label: 'Late', letter: 'L' },
  { value: 'ON_LEAVE', label: 'Leave', letter: 'Lv' },
];

export const statusLabel = (s: AttendanceStatus): string => STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;

// ---------- the API's shapes ----------

export interface RosterStudent {
  studentId: string;
  admissionNo: string;
  name: string;
  rollNo: number | null;
  status: AttendanceStatus | null;
  note: string | null;
  approvedLeave: { requestId: string; halfDay: boolean } | null;
  /** Only for a student with no saved mark: the register may pre-select this. */
  suggestedStatus: 'ON_LEAVE' | null;
}

/** `GET /attendance/divisions/:id?date=` and the answer to a save. */
export interface Roster {
  date: string;
  division: { id: string; name: string; class: { id: string; name: string } };
  canMark: boolean;
  marked: boolean;
  markedBy: string | null;
  markedAt: string | null;
  students: RosterStudent[];
}

/** `GET /attendance/divisions` */
export interface DivisionOption {
  id: string;
  name: string;
  class: { id: string; name: string };
  canMark: boolean;
}

export const divisionLabel = (d: { name: string; class: { name: string } }): string => `${d.class.name}-${d.name}`;

// ---------- what the teacher has chosen ----------

export type Drafts = Record<string, { status: AttendanceStatus | null; note: string }>;

/**
 * Starts from what is saved. A student with no saved mark but approved leave is pre-selected as
 * Leave with the note "Leave approved" (the API's `suggestedStatus`); nothing is saved until the
 * teacher saves, and they can change it.
 */
export function draftsFrom(roster: Pick<Roster, 'students'>): Drafts {
  return Object.fromEntries(
    roster.students.map((s) => {
      if (s.status) return [s.studentId, { status: s.status, note: s.note ?? '' }];
      if (s.suggestedStatus) return [s.studentId, { status: s.suggestedStatus, note: s.note ?? LEAVE_NOTE }];
      return [s.studentId, { status: null, note: s.note ?? '' }];
    }),
  );
}

export function setStatus(drafts: Drafts, studentId: string, status: AttendanceStatus): Drafts {
  return { ...drafts, [studentId]: { status, note: drafts[studentId]?.note ?? '' } };
}

export function setNote(drafts: Drafts, studentId: string, note: string): Drafts {
  return { ...drafts, [studentId]: { status: drafts[studentId]?.status ?? null, note: note.slice(0, NOTE_MAX) } };
}

/** Anyone already chosen (or pre-selected as on leave) keeps their mark; only the blanks become present. */
export function markEveryonePresent(roster: Pick<Roster, 'students'>, drafts: Drafts): Drafts {
  const next = { ...drafts };
  for (const s of roster.students) {
    if (!next[s.studentId]?.status) next[s.studentId] = { status: 'PRESENT', note: next[s.studentId]?.note ?? '' };
  }
  return next;
}

export interface Entry {
  studentId: string;
  status: AttendanceStatus;
  note?: string;
}

/** The students whose mark differs from what is saved: only these are sent. */
export function changesOf(roster: Pick<Roster, 'students'>, drafts: Drafts): Entry[] {
  const out: Entry[] = [];
  for (const s of roster.students) {
    const d = drafts[s.studentId];
    if (!d?.status) continue;
    const note = d.note.trim();
    if (d.status === s.status && note === (s.note ?? '')) continue;
    out.push({ studentId: s.studentId, status: d.status, ...(note ? { note } : {}) });
  }
  return out;
}

export interface RosterCounts {
  present: number;
  absent: number;
  late: number;
  onLeave: number;
  unmarked: number;
  total: number;
}

export function countsOf(roster: Pick<Roster, 'students'>, drafts: Drafts): RosterCounts {
  const c: RosterCounts = { present: 0, absent: 0, late: 0, onLeave: 0, unmarked: 0, total: roster.students.length };
  for (const s of roster.students) {
    const status = drafts[s.studentId]?.status ?? null;
    if (status === 'PRESENT') c.present++;
    else if (status === 'ABSENT') c.absent++;
    else if (status === 'LATE') c.late++;
    else if (status === 'ON_LEAVE') c.onLeave++;
    else c.unmarked++;
  }
  return c;
}

/** "3 absent, 1 late" for the words under the count tiles; empty when everyone is present. */
export function flaggedText(c: RosterCounts): string {
  const parts: string[] = [];
  if (c.absent) parts.push(`${c.absent} absent`);
  if (c.late) parts.push(`${c.late} late`);
  if (c.onLeave) parts.push(`${c.onLeave} on leave`);
  return parts.join(', ');
}

/** The register state of a division on a day, for the "My classes" card. */
export function registerState(overview: { enrolled: number; marked: number } | undefined): 'marked' | 'partial' | 'not-marked' {
  if (!overview || overview.marked === 0) return 'not-marked';
  return overview.marked < overview.enrolled ? 'partial' : 'marked';
}

// ---------- which days ----------

/** Today and the days before it that a teacher may still change, newest first. */
export function editableDays(today: string): string[] {
  return Array.from({ length: TEACHER_EDIT_DAYS + 1 }, (_, i) => addDays(today, -i));
}

/** True when a teacher may mark or change this day (not in the future, at most 7 days back). */
export function isEditableDay(date: string, today: string): boolean {
  return date <= today && daysBetween(date, today) <= TEACHER_EDIT_DAYS;
}

/** "Today", "Yesterday" or "Sat 14 Nov", for the day chips. */
export function dayChipLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return formatDay(date, 'short').replace(',', '');
}

/** A date from the address of the register screen, or today when it is missing or not a day. */
export function dateParam(value: string | string[] | undefined, today: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today;
  const [y, m, d] = raw.split('-').map(Number) as [number, number, number];
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) return today;
  return raw > today ? today : raw;
}

export const isSunday = (date: string): boolean => weekdayOf(date) === 0;

// ---------- the report ----------

export interface ReportStudent {
  studentId: string;
  admissionNo: string;
  name: string;
  rollNo: number | null;
  present: number;
  absent: number;
  late: number;
  onLeave: number;
  countedDays: number;
  attendedDays: number;
  markedDays: number;
  percent: number | null;
  days: Record<string, AttendanceStatus>;
}

/** `GET /attendance/divisions/:id/report` */
export interface DivisionReport {
  from: string;
  to: string;
  markedDates: string[];
  division: { id: string; name: string; class: { id: string; name: string } };
  daysMarked: number;
  students: ReportStudent[];
}

export type ReportRange = 'week' | 'month' | 'lastMonth' | 'year';

export const REPORT_RANGES: readonly { value: ReportRange; label: string }[] = [
  { value: 'week', label: '7 days' },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'year', label: 'This year' },
];

/** The `from` and `to` to send. "This year" sends only `to`; the API starts at the first day of the year. */
export function reportQuery(range: ReportRange, today: string): { from?: string; to: string } {
  if (range === 'week') return { from: addDays(today, -6), to: today };
  if (range === 'year') return { to: today };
  const month = today.slice(0, 7);
  if (range === 'month') return { from: `${month}-01`, to: today };
  const first = addDays(`${month}-01`, -1); // the last day of last month
  return { from: `${first.slice(0, 7)}-01`, to: first };
}

export const isLowPercent = (percent: number | null): boolean => percent !== null && percent < LOW_PERCENT;

/** "92.5%", or a dash before anything was counted. */
export const percentText = (percent: number | null): string => (percent === null ? '–' : `${percent}%`);

export interface ReportSummary {
  students: number;
  daysMarked: number;
  /** The whole division's percentage over the range (present + late of all counted days). */
  percent: number | null;
  low: number;
}

export function reportSummary(report: Pick<DivisionReport, 'students' | 'daysMarked'>): ReportSummary {
  let present = 0;
  let late = 0;
  let absent = 0;
  let onLeave = 0;
  let low = 0;
  for (const s of report.students) {
    present += s.present;
    late += s.late;
    absent += s.absent;
    onLeave += s.onLeave;
    if (isLowPercent(s.percent)) low++;
  }
  return {
    students: report.students.length,
    daysMarked: report.daysMarked,
    percent: summarise({ present, late, absent, onLeave }).percent,
    low,
  };
}

/** Lowest percentage first (children with nothing counted last), then by name. */
export function lowestFirst(students: readonly ReportStudent[]): ReportStudent[] {
  return [...students].sort((a, b) => {
    if (a.percent === null && b.percent !== null) return 1;
    if (b.percent === null && a.percent !== null) return -1;
    if (a.percent !== b.percent) return (a.percent ?? 0) - (b.percent ?? 0);
    return a.name.localeCompare(b.name);
  });
}
