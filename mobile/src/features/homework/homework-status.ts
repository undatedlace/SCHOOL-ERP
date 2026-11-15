/**
 * How the family sees a homework: which list it belongs to, what its badge says, and how its due
 * day reads. Plain functions, so the rules are tested without a screen.
 */
import { daysBetween, formatDay } from '@/lib/dates';
import type { BadgeTone } from '@/ui/Badge';
import type { Homework, Submission } from './types';

export type Bucket = 'TODO' | 'HANDED_IN' | 'MARKED';

/** The child's hand-in for this homework, if there is one. */
export function childSubmission(hw: Homework, studentId?: string | null): Submission | null {
  const child = hw.children.find((c) => c.studentId === studentId) ?? hw.children[0];
  return child?.submission ?? null;
}

/**
 * To do: nothing handed in, or sent back to be done again. Handed in: waiting for the teacher.
 * Marked: the teacher has marked it (locked).
 */
export function bucketOf(sub: Submission | null): Bucket {
  if (!sub || sub.status === 'REDO') return 'TODO';
  return sub.status === 'REVIEWED' ? 'MARKED' : 'HANDED_IN';
}

/**
 * Homework that is not handed in through the app has nothing to tick off, so once its day has
 * passed it leaves the lists instead of sitting in "To do" for ever.
 */
export function isFinished(hw: Homework, sub: Submission | null, today: string): boolean {
  return !hw.handIn && !sub && hw.dueOn !== null && hw.dueOn < today;
}

export interface Due {
  /** "Today", "Tomorrow", "Yesterday" or a date such as "18 Nov". */
  text: string;
  overdue: boolean;
}

export function dueInfo(dueOn: string | null, today: string): Due | null {
  if (!dueOn) return null;
  const days = daysBetween(today, dueOn);
  if (days === 0) return { text: 'Today', overdue: false };
  if (days === 1) return { text: 'Tomorrow', overdue: false };
  if (days === -1) return { text: 'Yesterday', overdue: true };
  const sameYear = dueOn.slice(0, 4) === today.slice(0, 4);
  return { text: formatDay(dueOn, sameYear ? 'dayMonth' : 'medium'), overdue: days < 0 };
}

/** "Due tomorrow", "Due 18 Nov", "Overdue, yesterday" or "No due date". */
export function dueLabel(dueOn: string | null, today: string): string {
  const due = dueInfo(dueOn, today);
  if (!due) return 'No due date';
  const text = ['Today', 'Tomorrow', 'Yesterday'].includes(due.text) ? due.text.toLowerCase() : due.text;
  return due.overdue ? `Overdue, ${text}` : `Due ${text}`;
}

/** "8/10" from "8.00" and "10.00": trailing zeros dropped. Null when there are no marks. */
export function marksText(marks: string | null | undefined, max: string | null | undefined): string | null {
  const m = trimNumber(marks);
  if (m === null) return null;
  const x = trimNumber(max);
  return x === null ? m : `${m}/${x}`;
}

function trimNumber(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

export interface StatusBadge {
  label: string;
  tone: BadgeTone;
}

export function statusBadge(hw: Homework, sub: Submission | null, today: string): StatusBadge {
  if (sub?.status === 'REVIEWED') {
    const marks = marksText(sub.marks, hw.maxMarks);
    return { label: marks ? `Marked ${marks}` : 'Marked', tone: 'good' };
  }
  if (sub?.status === 'REDO') return { label: 'Sent back', tone: 'warn' };
  if (sub) return sub.late ? { label: 'Handed in late', tone: 'warn' } : { label: 'Handed in', tone: 'info' };
  if (!hw.handIn) return { label: 'No hand-in', tone: 'neutral' };
  const overdue = hw.dueOn !== null && hw.dueOn < today;
  return { label: 'Not handed in', tone: overdue ? 'bad' : 'neutral' };
}

/** Soonest due day first; homework with no due day last; then newest first. */
export function sortByDue<T extends { dueOn: string | null; createdAt: string; title: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.dueOn !== b.dueOn) {
      if (a.dueOn === null) return 1;
      if (b.dueOn === null) return -1;
      return a.dueOn < b.dueOn ? -1 : 1;
    }
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
}

/** Can the child hand in (or hand in again)? Not once it is marked, and not when hand-in is off. */
export function canHandIn(hw: Homework, sub: Submission | null): boolean {
  return hw.handIn && sub?.status !== 'REVIEWED' && sub?.status !== 'SUBMITTED';
}

/** Taking back is allowed until the teacher marks it. */
export function canTakeBack(sub: Submission | null): boolean {
  return sub !== null && sub.status === 'SUBMITTED';
}

export interface Entry {
  hw: Homework;
  sub: Submission | null;
  bucket: Bucket;
}

/** The lists the Homework tab shows: finished no-hand-in work removed, each item with its bucket. */
export function entriesFor(items: readonly Homework[], studentId: string | null | undefined, today: string): Entry[] {
  return items.flatMap((hw) => {
    const sub = childSubmission(hw, studentId);
    if (isFinished(hw, sub, today)) return [];
    return [{ hw, sub, bucket: bucketOf(sub) }];
  });
}

export function countByBucket(entries: readonly Entry[]): Record<Bucket, number> {
  const counts: Record<Bucket, number> = { TODO: 0, HANDED_IN: 0, MARKED: 0 };
  for (const e of entries) counts[e.bucket] += 1;
  return counts;
}

/** The subjects that appear in the entries, sorted by name. */
export function subjectsOf(entries: readonly Entry[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const e of entries) if (e.hw.subject) seen.set(e.hw.subject.id, e.hw.subject.name);
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
