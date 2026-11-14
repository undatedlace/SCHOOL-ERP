/**
 * Dates and times in India time (Asia/Kolkata, UTC+05:30, no daylight saving).
 *
 * The school runs on India time, whatever the phone's own time zone says, so "today" and "now"
 * are worked out here with plain arithmetic on a fixed +05:30 offset. No Intl, no device time
 * zone: the same result on every phone and in tests.
 *
 * Date-only values from the API (a date of birth, a due date) are days, not moments. They arrive
 * as "2026-11-14" or "2026-11-14T00:00:00.000Z"; the first ten characters are the day.
 */

export const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface IstParts {
  year: number;
  /** 1 to 12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday */
  weekday: number;
}

/** The calendar date and clock time in India for a moment. */
export function istParts(moment: Date | number = new Date()): IstParts {
  const shifted = new Date((typeof moment === 'number' ? moment : moment.getTime()) + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Today's date in India as "YYYY-MM-DD". */
export function todayIST(now: Date | number = new Date()): string {
  const p = istParts(now);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The day part of an API date value ("2026-11-14T00:00:00.000Z" -> "2026-11-14"), or null. */
export function dayOf(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Midnight at the start of this India day, as a moment. */
export function startOfDayIST(day: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

/** Adds (or subtracts) whole days to a "YYYY-MM-DD" day. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const moved = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** Whole days from one day to another (later minus earlier). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/** 0 = Sunday, for a "YYYY-MM-DD" day. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Monday of the week that contains this day. */
export function startOfWeek(day: string): string {
  const w = weekdayOf(day);
  return addDays(day, w === 0 ? -6 : 1 - w);
}

export type DateStyle = 'short' | 'medium' | 'long' | 'weekday' | 'dayMonth';

/**
 * "14 Nov" (dayMonth), "14 Nov 2026" (medium, the default), "14 November 2026" (long),
 * "Sat, 14 Nov" (short) or "Saturday, 14 November" (weekday). Returns "–" for a missing value.
 */
export function formatDay(value: string | Date | null | undefined, style: DateStyle = 'medium'): string {
  const day = value instanceof Date ? todayIST(value) : dayOf(value);
  if (!day) return '–';
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const mon = MONTHS_SHORT[m - 1]!;
  const wd = weekdayOf(day);
  switch (style) {
    case 'dayMonth':
      return `${d} ${mon}`;
    case 'short':
      return `${DAYS_SHORT[wd]}, ${d} ${mon}`;
    case 'long':
      return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
    case 'weekday':
      return `${DAYS_LONG[wd]}, ${d} ${MONTHS_LONG[m - 1]}`;
    default:
      return `${d} ${mon} ${y}`;
  }
}

/** "HH:mm" (24 hour, as the API sends times) to "2:30 pm". Returns "–" when it cannot be read. */
export function formatClock(hhmm: string | null | undefined): string {
  const m = typeof hhmm === 'string' ? /^(\d{1,2}):(\d{2})/.exec(hhmm) : null;
  if (!m) return '–';
  const h = Number(m[1]);
  const min = m[2];
  if (h > 23 || Number(min) > 59) return '–';
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${suffix}`;
}

/** A moment shown in India time: "14 Nov, 2:30 pm". */
export function formatDateTime(moment: string | Date | null | undefined): string {
  if (!moment) return '–';
  const date = moment instanceof Date ? moment : new Date(moment);
  if (Number.isNaN(date.getTime())) return '–';
  const p = istParts(date);
  return `${p.day} ${MONTHS_SHORT[p.month - 1]}, ${formatClock(`${pad(p.hour)}:${pad(p.minute)}`)}`;
}

/** Minutes since midnight, India time. */
export function minutesNowIST(now: Date | number = new Date()): number {
  const p = istParts(now);
  return p.hour * 60 + p.minute;
}

/** "HH:mm" to minutes since midnight, or null. */
export function minutesOf(hhmm: string | null | undefined): number | null {
  const m = typeof hhmm === 'string' ? /^(\d{1,2}):(\d{2})/.exec(hhmm) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** "Good morning", "Good afternoon" or "Good evening", by the hour in India. */
export function greeting(now: Date | number = new Date()): string {
  const hour = istParts(now).hour;
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "just now", "5 min ago", "3 hours ago", "yesterday", then the date. */
export function timeAgo(moment: string | Date | number | null | undefined, now: Date | number = new Date()): string {
  if (moment === null || moment === undefined) return '–';
  const then = typeof moment === 'number' ? moment : new Date(moment).getTime();
  if (Number.isNaN(then)) return '–';
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const minutes = Math.floor((nowMs - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = daysBetween(todayIST(then), todayIST(nowMs));
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDay(todayIST(then), 'medium');
}
