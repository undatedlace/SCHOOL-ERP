import { CalendarCategory, CalendarEvent } from '../../core/models';
import { fromIsoDate, toIsoDate } from '../../shared/dates';

export const CATEGORY_LABEL: Record<CalendarCategory, string> = {
  EVENT: 'Event',
  HOLIDAY: 'Holiday',
  EXAM: 'Exam',
  MEETING: 'Meeting',
};

/** Tile colours (the label is always written too, so colour is never the only cue). */
export const CATEGORY_CLASS: Record<CalendarCategory, string> = {
  EVENT: 'bg-lavender',
  HOLIDAY: 'bg-sun',
  EXAM: 'bg-sky',
  MEETING: 'bg-muted',
};

export interface MonthCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** The weeks shown for a month (Sunday first): whole weeks, 5 or 6 of them. month is 0 to 11. */
export function monthGrid(year: number, month: number): MonthCell[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const weeks: MonthCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: MonthCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      week.push({ iso: toIsoDate(date), day: date.getDate(), inMonth: date.getMonth() === month });
    }
    if (w === 5 && !week.some((c) => c.inMonth)) break;
    weeks.push(week);
  }
  return weeks;
}

/** First and last day shown on the grid, so every visible cell has its events. */
export function gridRange(year: number, month: number): { from: string; to: string } {
  const weeks = monthGrid(year, month);
  return { from: weeks[0][0].iso, to: weeks[weeks.length - 1][6].iso };
}

/** Events that fall on a day (multi-day events appear on each day they cover). */
export function eventsOn(events: CalendarEvent[], iso: string): CalendarEvent[] {
  return events
    .filter((e) => e.startsOn <= iso && iso <= e.endsOn)
    .sort(
      (a, b) =>
        (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title),
    );
}

/** "10:00 am" from "10:00" (24 hours). */
export function timeText(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "10:00 am - 12:00 pm", or "All day". */
export function timeRangeText(e: Pick<CalendarEvent, 'startTime' | 'endTime'>): string {
  if (!e.startTime) return 'All day';
  return e.endTime ? `${timeText(e.startTime)} - ${timeText(e.endTime)}` : timeText(e.startTime);
}

/** "5 Dec" or "5 Dec - 7 Dec". */
export function dateRangeText(e: Pick<CalendarEvent, 'startsOn' | 'endsOn'>): string {
  const f = (s: string) =>
    fromIsoDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return e.startsOn === e.endsOn ? f(e.startsOn) : `${f(e.startsOn)} - ${f(e.endsOn)}`;
}

export function monthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** Moves a month by some months (negative = back), rolling the year. */
export function shiftMonth(
  year: number,
  month: number,
  by: number,
): { year: number; month: number } {
  const d = new Date(year, month + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
