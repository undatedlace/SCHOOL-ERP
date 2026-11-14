/** What the timetable API sends and takes. */

export type SlotKind = 'PERIOD' | 'BREAK' | 'ASSEMBLY';

export interface Slot {
  id?: string;
  kind: SlotKind;
  label: string;
  startsAt: string;
  endsAt: string;
  /** ISO weekdays, 1 Monday to 6 Saturday. */
  days: number[];
  sortOrder?: number;
}

export interface Schedule {
  id: string;
  name: string;
  active: boolean;
  slots: (Slot & { id: string })[];
  classIds: string[];
}

export interface TimingsList {
  academicYear: { id: string; name: string };
  schedules: Schedule[];
  classes: { id: string; name: string; scheduleId: string | null }[];
}

export interface GenerateInput {
  firstStart: string;
  periodMinutes: number;
  periodsPerDay: number;
  gapMinutes: number;
  assemblyMinutes?: number;
  breaks: { afterPeriod: number; label: string; minutes: number }[];
  days: number[];
}

export interface PersonRef {
  id: string;
  fullName: string;
}

export interface SubjectRef {
  id: string;
  name: string;
}

export interface GridRow {
  key: string;
  kind: SlotKind;
  label: string;
  startsAt: string;
  endsAt: string;
  days: number[];
}

export interface GridCell {
  id: string;
  rowKey: string;
  slotId: string;
  weekday: number;
  subject: SubjectRef | null;
  staff: PersonRef | null;
  room: string | null;
  division: { id: string; label: string };
}

export interface GridChange {
  id: string;
  date: string;
  rowKey: string;
  slotId: string;
  kind: 'SUBSTITUTE' | 'CANCELLED';
  division: { id: string; label: string };
  substitute: PersonRef | null;
  subject: SubjectRef | null;
  reason: string | null;
}

export interface WeekDay {
  date: string;
  weekday: number;
  name: string;
  holiday: string | null;
}

export interface WeekView {
  academicYear: { id: string; name: string };
  today: string;
  weekOf: string;
  days: WeekDay[];
  rows: GridRow[];
  cells: GridCell[];
  changes: GridChange[];
}

export interface DivisionWeek extends WeekView {
  division: { id: string; name: string; label: string; class: { id: string; name: string } };
  schedule: { id: string; name: string } | null;
  classTeacher: PersonRef | null;
  periodsPerWeek: { subject: SubjectRef; count: number }[];
  team: { subject: SubjectRef; staff: PersonRef[] }[];
  warnings?: string[];
}

export interface StaffWeek extends WeekView {
  staff: PersonRef;
  periodsPerWeek: number;
}

export interface DivisionOption {
  id: string;
  name: string;
  label: string;
  class: { id: string; name: string };
  students: PersonRef[];
}

export interface EntryInput {
  slotId: string;
  weekday: number;
  subjectId?: string | null;
  /** Leave out to use the subject teacher from Academic setup. */
  staffId?: string | null;
  room?: string | null;
}

export interface DayPeriod {
  division: { id: string; label: string };
  slot: { id: string; label: string; startsAt: string; endsAt: string };
  subject: SubjectRef | null;
  change: { id: string; kind: 'SUBSTITUTE' | 'CANCELLED'; substitute: PersonRef | null } | null;
}

export interface DayView {
  academicYear: { id: string; name: string };
  date: string;
  weekday: number;
  dayName: string;
  holiday: string | null;
  onLeave: { staff: PersonRef; halfDay: boolean; leaveType: string; periods: DayPeriod[] }[];
  needsSubstitute: number;
  changes: {
    id: string;
    kind: 'SUBSTITUTE' | 'CANCELLED';
    date: string;
    division: { id: string; label: string };
    slot: { id: string; label: string; startsAt: string; endsAt: string };
    regularStaff: PersonRef | null;
    regularSubject: SubjectRef | null;
    substitute: PersonRef | null;
    subject: SubjectRef | null;
    reason: string;
    by: string;
  }[];
}

export interface FreeTeachers {
  date: string;
  division: { id: string; label: string };
  slot: { id: string; label: string; startsAt: string; endsAt: string };
  teachers: {
    id: string;
    fullName: string;
    teachesSubjectHere: boolean;
    teachesDivision: boolean;
    periodsThatDay: number;
    halfDayLeave: boolean;
  }[];
}

export const WEEKDAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LONG = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** 1 Monday to 7 Sunday. */
export function weekdayOf(iso: string): number {
  const d = toDate(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Today in India, as "YYYY-MM-DD". */
export const todayInIndia = (now = new Date()) => toIso(new Date(now.getTime() + 330 * 60_000));

/** "9 Nov" or "9–14 Nov 2026" for a week. */
export function weekTitle(days: WeekDay[]): string {
  if (!days.length) return '';
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    toDate(iso).toLocaleDateString('en-IN', { timeZone: 'UTC', ...opts });
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  return sameMonth
    ? `${fmt(first, { day: 'numeric' })}–${fmt(last, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${fmt(first, { day: 'numeric', month: 'short' })} – ${fmt(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export const shortDate = (iso: string) =>
  toDate(iso).toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
