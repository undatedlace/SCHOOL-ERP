/**
 * The calendar's rules as plain functions: the month grid, which events fall on which day, and
 * how an event's time reads. Days are "YYYY-MM-DD" strings in India time (see `@/lib/dates`).
 */
import { addDays, formatClock, formatDay, startOfWeek, weekdayOf } from '@/lib/dates';
import type { BadgeTone } from '@/ui/Badge';
import type { CalendarCategory, CalendarEvent } from './types';

export interface YearMonth {
  year: number;
  /** 1 to 12 */
  month: number;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

export const monthOf = (day: string): YearMonth => ({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) });
export const firstOfMonth = ({ year, month }: YearMonth) => `${year}-${pad(month)}-01`;
export const monthTitle = ({ year, month }: YearMonth) => `${MONTHS[month - 1]} ${year}`;

export function addMonths({ year, month }: YearMonth, by: number): YearMonth {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function daysInMonth({ year, month }: YearMonth): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export const lastOfMonth = (ym: YearMonth) => `${ym.year}-${pad(ym.month)}-${pad(daysInMonth(ym))}`;

/** The weeks shown for a month, Monday first, each a list of seven days (days of other months included). */
export function monthWeeks(ym: YearMonth): string[][] {
  const first = firstOfMonth(ym);
  const start = startOfWeek(first);
  const last = lastOfMonth(ym);
  const weeks: string[][] = [];
  for (let weekStart = start; weekStart <= last; weekStart = addDays(weekStart, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)));
  }
  return weeks;
}

/** First and last day of the grid for a month: what to ask the API for. */
export function gridRange(ym: YearMonth): { from: string; to: string } {
  const weeks = monthWeeks(ym);
  return { from: weeks[0]![0]!, to: weeks[weeks.length - 1]![6]! };
}

export const isSunday = (day: string) => weekdayOf(day) === 0;

/** Events on one day (an event may span several), all-day ones first, then by start time. */
export function eventsOnDay(events: readonly CalendarEvent[], day: string): CalendarEvent[] {
  return events
    .filter((e) => e.startsOn <= day && day <= e.endsOn)
    .sort((a, b) => {
      const aTime = a.startTime ?? '';
      const bTime = b.startTime ?? '';
      if (aTime !== bTime) return aTime < bTime ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
}

/** For each day of a range that has events, the kinds of event on it (for the dots). */
export function categoriesByDay(events: readonly CalendarEvent[], from: string, to: string): Map<string, CalendarCategory[]> {
  const map = new Map<string, CalendarCategory[]>();
  for (const e of events) {
    const start = e.startsOn < from ? from : e.startsOn;
    const end = e.endsOn > to ? to : e.endsOn;
    for (let day = start; day <= end; day = addDays(day, 1)) {
      const list = map.get(day) ?? [];
      if (!list.includes(e.category)) list.push(e.category);
      map.set(day, list);
    }
  }
  return map;
}

export const CATEGORY_LABEL: Record<CalendarCategory, string> = {
  HOLIDAY: 'Holiday',
  EXAM: 'Exam',
  EVENT: 'Event',
  MEETING: 'Meeting',
};

export const CATEGORY_TONE: Record<CalendarCategory, BadgeTone> = {
  HOLIDAY: 'good',
  EXAM: 'warn',
  EVENT: 'primary',
  MEETING: 'info',
};

/** "All day" or "9:00 am to 12:30 pm" (times are India time, as the API sends them). */
export function timeText(e: Pick<CalendarEvent, 'startTime' | 'endTime'>): string {
  if (!e.startTime) return 'All day';
  const start = formatClock(e.startTime);
  return e.endTime ? `${start} to ${formatClock(e.endTime)}` : start;
}

/** "14 Nov" for one day, "14 Nov to 16 Nov" for several. */
export function dateSpanText(e: Pick<CalendarEvent, 'startsOn' | 'endsOn'>): string {
  return e.startsOn === e.endsOn ? formatDay(e.startsOn, 'dayMonth') : `${formatDay(e.startsOn, 'dayMonth')} to ${formatDay(e.endsOn, 'dayMonth')}`;
}

/** Events of a month grouped by the first day they show in that month, in date order. */
export function groupByStartDay(events: readonly CalendarEvent[], from: string, to: string): { day: string; events: CalendarEvent[] }[] {
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (e.endsOn < from || e.startsOn > to) continue;
    const day = e.startsOn < from ? from : e.startsOn;
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({ day, events: eventsOnDay(list, day) }));
}
