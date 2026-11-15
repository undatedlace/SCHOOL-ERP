/** Pure helpers for the Home screen cards. */
import { addDays, daysBetween, formatDay, startOfWeek } from '@/lib/dates';
import { parseRupees } from '@/lib/money';

// ---------- homework ----------

export interface HomeworkItem {
  id: string;
  title: string;
  subject: { id: string; name: string } | null;
  /** "YYYY-MM-DD" or null */
  dueOn: string | null;
  overdue: boolean;
  children: { studentId: string; submission: { status: 'SUBMITTED' | 'REVIEWED' | 'REDO' } | null }[];
}

/** Still to do: nothing handed in yet, or sent back to be done again. */
export function isToDo(item: HomeworkItem): boolean {
  const child = item.children[0];
  if (!child || !child.submission) return true;
  return child.submission.status === 'REDO';
}

/** Sunday of the week that contains `today`. */
export const endOfWeek = (today: string): string => addDays(startOfWeek(today), 6);

/** Homework still to do that falls due from today to the end of this week, soonest first. */
export function homeworkDueThisWeek(items: readonly HomeworkItem[], today: string): HomeworkItem[] {
  const end = endOfWeek(today);
  return items
    .filter((h) => h.dueOn !== null && h.dueOn >= today && h.dueOn <= end && isToDo(h))
    .sort((a, b) => (a.dueOn! < b.dueOn! ? -1 : a.dueOn! > b.dueOn! ? 1 : a.title.localeCompare(b.title)));
}

/** "Due today", "Due tomorrow", "Due Wed, 18 Nov". */
export function dueText(dueOn: string | null, today: string): string {
  if (!dueOn) return 'No due day';
  const days = daysBetween(today, dueOn);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due ${formatDay(dueOn, 'short')}`;
}

// ---------- fees ----------

export interface FeeLedger {
  totals: { gross: string; concessions: string; paid: string; pending: string };
  invoices: { instalments: { pending: string; overdue: boolean; dueDate: string }[] }[];
}

export interface FeesSummary {
  pendingPaise: number;
  overduePaise: number;
  /** Oldest overdue due date, or null. */
  oldestOverdueOn: string | null;
}

/** What is owed, and how much of it is overdue (instalments whose day has passed). */
export function feesSummary(ledger: FeeLedger): FeesSummary {
  const pendingPaise = parseRupees(ledger.totals.pending) ?? 0;
  let overduePaise = 0;
  let oldest: string | null = null;
  for (const inv of ledger.invoices) {
    for (const i of inv.instalments) {
      if (!i.overdue) continue;
      overduePaise += parseRupees(i.pending) ?? 0;
      if (oldest === null || i.dueDate < oldest) oldest = i.dueDate;
    }
  }
  return { pendingPaise, overduePaise, oldestOverdueOn: oldest };
}

// ---------- calendar ----------

export type EventCategory = 'EVENT' | 'HOLIDAY' | 'EXAM' | 'MEETING';

export interface CalendarEvent {
  id: string;
  title: string;
  category: EventCategory;
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
}

/** The next few events that have not ended, soonest first (an event running now counts). */
export function upcomingEvents(events: readonly CalendarEvent[], today: string, limit: number): CalendarEvent[] {
  return events
    .filter((e) => e.endsOn >= today)
    .sort((a, b) => {
      const sa = a.startsOn < today ? today : a.startsOn;
      const sb = b.startsOn < today ? today : b.startsOn;
      return sa < sb ? -1 : sa > sb ? 1 : (a.startTime ?? '').localeCompare(b.startTime ?? '');
    })
    .slice(0, limit);
}

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  EVENT: 'Event',
  HOLIDAY: 'Holiday',
  EXAM: 'Exam',
  MEETING: 'Meeting',
};
