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

// ---------- Views: day, week, month, year ----------

export type CalendarView = 'day' | 'week' | 'month' | 'year';

export const VIEW_LABEL: Record<CalendarView, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

export function addDays(iso: string, by: number): string {
  const d = fromIsoDate(iso);
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + by));
}

/** The Sunday on or before a day. */
export function weekStart(iso: string): string {
  return addDays(iso, -fromIsoDate(iso).getDay());
}

export function weekDays(iso: string): string[] {
  const start = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Moves a day by whole months, keeping the day of the month when it exists (31 Jan + 1 = 28 Feb). */
export function shiftMonths(iso: string, by: number): string {
  const d = fromIsoDate(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + by, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toIsoDate(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last)));
}

/** The days a view needs events for. */
export function viewRange(view: CalendarView, iso: string): { from: string; to: string } {
  const d = fromIsoDate(iso);
  switch (view) {
    case 'day':
      return { from: iso, to: iso };
    case 'week': {
      const days = weekDays(iso);
      return { from: days[0], to: days[6] };
    }
    case 'month':
      return gridRange(d.getFullYear(), d.getMonth());
    case 'year':
      return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
  }
}

/** One step back (-1) or forward (1) in the current view. */
export function shiftView(view: CalendarView, iso: string, by: number): string {
  switch (view) {
    case 'day':
      return addDays(iso, by);
    case 'week':
      return addDays(iso, 7 * by);
    case 'month':
      return shiftMonths(iso, by);
    case 'year':
      return shiftMonths(iso, 12 * by);
  }
}

export function viewTitle(view: CalendarView, iso: string): string {
  const d = fromIsoDate(iso);
  if (view === 'year') return String(d.getFullYear());
  if (view === 'month') return monthTitle(d.getFullYear(), d.getMonth());
  if (view === 'day') {
    return d.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
  const days = weekDays(iso);
  const a = fromIsoDate(days[0]);
  const b = fromIsoDate(days[6]);
  const short = (x: Date) => x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} - ${b.getDate()} ${b.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`
    : `${short(a)} - ${short(b)} ${b.getFullYear()}`;
}

// ---------- Hourly grid (day and week) ----------

/** An event with no start time, or one that lasts several days, sits in the "all-day" band. */
export const isAllDay = (e: Pick<CalendarEvent, 'startTime' | 'startsOn' | 'endsOn'>): boolean =>
  !e.startTime || e.startsOn !== e.endsOn;

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** "6 AM", "12 PM" for the hour labels. */
export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`;
}

export interface PlacedEvent {
  event: CalendarEvent;
  startMin: number;
  endMin: number;
  /** Which side-by-side column it sits in, out of `lanes` (events that overlap share the width). */
  lane: number;
  lanes: number;
}

/** Shortest block drawn, so a short event can still be read and pressed. */
const MIN_BLOCK = 30;

/** Places timed events on one day: start and end in minutes, and side-by-side lanes for overlaps. */
export function layoutTimed(events: CalendarEvent[]): PlacedEvent[] {
  const items = events
    .filter((e) => !isAllDay(e))
    .map((event) => {
      const startMin = toMinutes(event.startTime!);
      const planned = event.endTime ? toMinutes(event.endTime) : startMin + 60;
      return { event, startMin, endMin: Math.min(1440, Math.max(planned, startMin + MIN_BLOCK)) };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const placed: PlacedEvent[] = [];
  let cluster: PlacedEvent[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const close = () => {
    for (const p of cluster) p.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const it of items) {
    if (it.startMin >= clusterEnd) close();
    let lane = laneEnds.findIndex((end) => end <= it.startMin);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = it.endMin;
    const p: PlacedEvent = { ...it, lane, lanes: 1 };
    cluster.push(p);
    placed.push(p);
    clusterEnd = cluster.length === 1 ? it.endMin : Math.max(clusterEnd, it.endMin);
  }
  close();
  return placed;
}

/** The months of a year, each with its weeks, for the year view. */
export function yearMonths(year: number): { month: number; name: string; weeks: MonthCell[][] }[] {
  return Array.from({ length: 12 }, (_, month) => ({
    month,
    name: new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long' }),
    weeks: monthGrid(year, month),
  }));
}
