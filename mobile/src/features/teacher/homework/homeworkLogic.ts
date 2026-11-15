/**
 * Pure rules for the teacher's homework screens: how much of a task is handed in and marked,
 * which tab a task belongs to, the marking queue, the form's checks and the bodies sent to the
 * API. No React and no clock (the caller passes "today"), so it is all tested.
 */
import { formatDay } from '@/lib/dates';
import type { HandInEntry, HandInRoster, Submission, TeacherHomework } from './types';

export const TITLE_MIN = 2;
export const TITLE_MAX = 150;
export const INSTRUCTIONS_MAX = 5000;
export const FEEDBACK_MAX = 1000;
export const MAX_FILES = 5;
export const MAX_DIVISIONS = 50;
export const MAX_STUDENTS = 200;
export const ATTACHMENT_PURPOSE = 'homework-attachment';

// ---------- how far each task has got ----------

export interface HomeworkStats {
  /** Students the task reaches. */
  students: number;
  /** Work with the teacher now: waiting to be marked, or already marked. */
  handedIn: number;
  /** Waiting to be marked. */
  toMark: number;
  marked: number;
  /** Sent back to be done again. */
  redo: number;
}

const submissionOf = (e: Pick<HandInEntry, 'submission'>): Submission | null => e.submission;

/** The counts from a hand-in roster (`GET /homework/:id/hand-ins`). */
export function statsFromRoster(roster: Pick<HandInRoster, 'students'>): HomeworkStats {
  const s: HomeworkStats = { students: roster.students.length, handedIn: 0, toMark: 0, marked: 0, redo: 0 };
  for (const e of roster.students) {
    const sub = submissionOf(e);
    if (!sub) continue;
    if (sub.status === 'SUBMITTED') {
      s.toMark++;
      s.handedIn++;
    } else if (sub.status === 'REVIEWED') {
      s.marked++;
      s.handedIn++;
    } else {
      s.redo++;
    }
  }
  return s;
}

/** "9 of 24 handed in" */
export const handedInText = (s: HomeworkStats): string => `${s.handedIn} of ${s.students} handed in`;

/** "15 of 24 marked": of the work handed in, how much has been marked. */
export const markedProgressText = (s: HomeworkStats): string => `${s.marked} of ${s.handedIn} marked`;

/** 0 to 1: the share of handed-in work that is marked. 1 when nothing is waiting. */
export function markedShare(s: HomeworkStats): number {
  return s.handedIn === 0 ? 1 : s.marked / s.handedIn;
}

// ---------- the tabs ----------

export type Bucket = 'TO_MARK' | 'OPEN' | 'MARKED';
export type Tab = 'ALL' | Bucket;

export const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'TO_MARK', label: 'To mark' },
  { value: 'OPEN', label: 'Open' },
  { value: 'MARKED', label: 'Marked' },
];

/** Past its last day. A task with no day never closes. */
export const isPastDue = (hw: Pick<TeacherHomework, 'dueOn'>, today: string): boolean => hw.dueOn !== null && hw.dueOn < today;

/**
 * To mark: work is waiting for the teacher. Open: still collecting (its day has not passed) and
 * nothing waits. Marked: its day has passed and nothing waits (everything handed in is marked).
 */
export function bucketOf(hw: Pick<TeacherHomework, 'dueOn'>, stats: HomeworkStats | undefined, today: string): Bucket {
  if (stats && stats.toMark > 0) return 'TO_MARK';
  return isPastDue(hw, today) ? 'MARKED' : 'OPEN';
}

export interface Filters {
  tab: Tab;
  /** A division id or 'all'. */
  divisionId: string;
  /** A subject id or 'all'. */
  subjectId: string;
}

export const NO_FILTERS: Filters = { tab: 'ALL', divisionId: 'all', subjectId: 'all' };

function matchesFilters(hw: TeacherHomework, f: Pick<Filters, 'divisionId' | 'subjectId'>): boolean {
  if (f.divisionId !== 'all' && !hw.divisions.some((d) => d.id === f.divisionId)) return false;
  if (f.subjectId !== 'all' && hw.subject?.id !== f.subjectId) return false;
  return true;
}

/** The count on each tab, with the division and subject filters applied. */
export function tabCounts(
  items: readonly TeacherHomework[],
  stats: ReadonlyMap<string, HomeworkStats>,
  filters: Pick<Filters, 'divisionId' | 'subjectId'>,
  today: string,
): Record<Tab, number> {
  const counts: Record<Tab, number> = { ALL: 0, TO_MARK: 0, OPEN: 0, MARKED: 0 };
  for (const hw of items) {
    if (!matchesFilters(hw, filters)) continue;
    counts.ALL++;
    counts[bucketOf(hw, stats.get(hw.id), today)]++;
  }
  return counts;
}

/** Tasks for the chosen tab, with work to mark first, then the soonest due day, then the newest. */
export function visibleItems(
  items: readonly TeacherHomework[],
  stats: ReadonlyMap<string, HomeworkStats>,
  filters: Filters,
  today: string,
): TeacherHomework[] {
  return items
    .filter((hw) => matchesFilters(hw, filters) && (filters.tab === 'ALL' || bucketOf(hw, stats.get(hw.id), today) === filters.tab))
    .sort((a, b) => {
      const ma = (stats.get(a.id)?.toMark ?? 0) > 0 ? 0 : 1;
      const mb = (stats.get(b.id)?.toMark ?? 0) > 0 ? 0 : 1;
      if (ma !== mb) return ma - mb;
      return compareByDue(a, b);
    });
}

/** Oldest due day first; tasks with no day last; then the older task first. */
export function compareByDue(
  a: Pick<TeacherHomework, 'dueOn' | 'createdAt' | 'title'>,
  b: Pick<TeacherHomework, 'dueOn' | 'createdAt' | 'title'>,
): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.title.localeCompare(b.title);
}

// ---------- the marking queue ----------

export interface QueueItem {
  homework: TeacherHomework;
  stats: HomeworkStats;
}

/** Tasks with work waiting, the oldest due day first (the one most overdue to mark leads). */
export function markingQueue(items: readonly TeacherHomework[], stats: ReadonlyMap<string, HomeworkStats>): QueueItem[] {
  return items
    .flatMap((homework) => {
      const s = stats.get(homework.id);
      return s && s.toMark > 0 ? [{ homework, stats: s }] : [];
    })
    .sort((a, b) => compareByDue(a.homework, b.homework));
}

/** How many pieces of work wait for the teacher in all. */
export const awaitingMarking = (queue: readonly QueueItem[]): number => queue.reduce((n, q) => n + q.stats.toMark, 0);

/** "Due 16 Nov", "Due today", "Overdue since 12 Nov" or "No due day". */
export function dueText(dueOn: string | null, today: string): string {
  if (!dueOn) return 'No due day';
  if (dueOn === today) return 'Due today';
  const label = formatDay(dueOn, dueOn.slice(0, 4) === today.slice(0, 4) ? 'dayMonth' : 'medium');
  return dueOn < today ? `Due ${label} (past)` : `Due ${label}`;
}

// ---------- the form ----------

export interface Draft {
  title: string;
  instructions: string;
  subjectId: string | null;
  dueOn: string | null;
  handIn: boolean;
  /** Marks are out of this number; text so a half-typed number is kept. */
  maxMarks: string;
  divisionIds: string[];
  studentIds: string[];
}

export const emptyDraft = (): Draft => ({
  title: '',
  instructions: '',
  subjectId: null,
  dueOn: null,
  handIn: false,
  maxMarks: '',
  divisionIds: [],
  studentIds: [],
});

/** A draft to change an existing task. */
export function draftFrom(hw: TeacherHomework): Draft {
  return {
    title: hw.title,
    instructions: hw.instructions,
    subjectId: hw.subject?.id ?? null,
    dueOn: hw.dueOn,
    handIn: hw.handIn,
    maxMarks: hw.maxMarks ? trimNumber(hw.maxMarks) : '',
    divisionIds: hw.divisions.map((d) => d.id),
    studentIds: hw.students.map((s) => s.id),
  };
}

export interface DraftErrors {
  title?: string;
  instructions?: string;
  audience?: string;
  dueOn?: string;
  maxMarks?: string;
}

/** "10.00" becomes "10", "7.50" becomes "7.5", "10" stays "10" (the API drops trailing zeros itself). */
export function trimNumber(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

/** Parses "12", "12.5" or "12.50" into a number, or null when it is not a plain number. */
export function parseMarks(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

/**
 * The checks the API makes, so a person sees the problem before sending. `editing` skips the
 * audience (it cannot be changed after sending) and lets an old due day stay.
 */
export function validateDraft(draft: Draft, today: string, editing: boolean): DraftErrors {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  if (title.length < TITLE_MIN) errors.title = 'Give the homework a title.';
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;
  const text = draft.instructions.trim();
  if (!text) errors.instructions = 'Write what the students should do.';
  else if (text.length > INSTRUCTIONS_MAX) errors.instructions = `Keep the instructions under ${INSTRUCTIONS_MAX} characters.`;
  if (!editing) {
    if (draft.divisionIds.length + draft.studentIds.length === 0) errors.audience = 'Choose who it is for.';
    else if (draft.divisionIds.length > MAX_DIVISIONS) errors.audience = `Choose at most ${MAX_DIVISIONS} classes.`;
    else if (draft.studentIds.length > MAX_STUDENTS) errors.audience = `Choose at most ${MAX_STUDENTS} students.`;
    if (draft.dueOn && draft.dueOn < today) errors.dueOn = 'The due day cannot be in the past.';
  }
  if (draft.maxMarks.trim() !== '') {
    const n = parseMarks(draft.maxMarks);
    if (!draft.handIn) errors.maxMarks = 'Marks can be given only when students hand work in.';
    else if (n === null || n < 0.01 || n > 1000) errors.maxMarks = 'Use a number from 0.01 to 1000, with at most two decimals.';
  }
  return errors;
}

export const hasErrors = (e: DraftErrors): boolean => Object.keys(e).length > 0;

/** The body of `POST /homework`. */
export function createBody(draft: Draft, attachmentFileIds: string[]) {
  const marks = draft.handIn ? parseMarks(draft.maxMarks) : null;
  return {
    title: draft.title.trim(),
    instructions: draft.instructions.trim(),
    ...(draft.subjectId ? { subjectId: draft.subjectId } : {}),
    ...(draft.dueOn ? { dueOn: draft.dueOn } : {}),
    handIn: draft.handIn,
    ...(marks !== null ? { maxMarks: marks } : {}),
    ...(attachmentFileIds.length ? { attachmentFileIds } : {}),
    ...(draft.divisionIds.length ? { divisionIds: draft.divisionIds } : {}),
    ...(draft.studentIds.length ? { studentIds: draft.studentIds } : {}),
  };
}

/**
 * The body of `PATCH /homework/:id`. An empty `dueOn` removes the due day. The attachments sent
 * are the whole list that should remain (the API replaces them), so pass the kept ones too.
 */
export function updateBody(draft: Draft, attachmentFileIds: string[]) {
  const marks = draft.handIn ? parseMarks(draft.maxMarks) : null;
  return {
    title: draft.title.trim(),
    instructions: draft.instructions.trim(),
    ...(draft.subjectId ? { subjectId: draft.subjectId } : {}),
    dueOn: draft.dueOn ?? '',
    handIn: draft.handIn,
    ...(marks !== null ? { maxMarks: marks } : {}),
    attachmentFileIds,
  };
}

/** Adds or removes an id from a list. */
export function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** "Nursery-A and 2 students" for the line under a task. */
export function audienceText(hw: Pick<TeacherHomework, 'divisions' | 'students'>): string {
  const parts: string[] = [];
  if (hw.divisions.length) parts.push(hw.divisions.map((d) => d.label).join(', '));
  if (hw.students.length) parts.push(hw.students.length === 1 ? hw.students[0]!.name : `${hw.students.length} students`);
  return parts.join(' and ') || 'No one';
}

// ---------- marking a hand-in ----------

export type ReviewAction = 'REVIEWED' | 'REDO';

export interface ReviewInput {
  action: ReviewAction;
  /** The marks typed, "" for none. */
  marks: string;
  /** The task's maximum ("10.00"), or null when it has no marks. */
  maxMarks: string | null;
  feedback: string;
}

/** The sentence to show when the review cannot be sent, or null. */
export function reviewProblem(input: ReviewInput): string | null {
  if (input.feedback.trim().length > FEEDBACK_MAX) return `Keep the comment under ${FEEDBACK_MAX} characters.`;
  if (input.action === 'REDO') return input.feedback.trim() ? null : 'Say what should be done again.';
  if (input.marks.trim() === '') return null;
  if (input.maxMarks === null) return 'This homework has no marks.';
  const n = parseMarks(input.marks);
  if (n === null) return 'Marks must be a number with at most two decimals.';
  if (n > Number(input.maxMarks)) return `Marks cannot be more than ${trimNumber(input.maxMarks)}.`;
  return null;
}

/** The body of `PUT /homework/:id/students/:studentId/review`. Marks go only with a marking. */
export function reviewBody(input: ReviewInput) {
  const feedback = input.feedback.trim();
  const marks = input.action === 'REVIEWED' && input.maxMarks !== null ? parseMarks(input.marks) : null;
  return {
    status: input.action,
    ...(marks !== null ? { marks } : {}),
    ...(feedback ? { feedback } : {}),
  };
}

// ---------- the roster ----------

export type RosterFilter = 'ALL' | 'TO_MARK' | 'NOT_HANDED' | 'MARKED' | 'REDO';

export function rosterGroup(e: Pick<HandInEntry, 'submission'>): Exclude<RosterFilter, 'ALL'> {
  const sub = e.submission;
  if (!sub) return 'NOT_HANDED';
  return sub.status === 'SUBMITTED' ? 'TO_MARK' : sub.status === 'REVIEWED' ? 'MARKED' : 'REDO';
}

export function rosterCounts(students: readonly HandInEntry[]): Record<RosterFilter, number> {
  const c: Record<RosterFilter, number> = { ALL: students.length, TO_MARK: 0, NOT_HANDED: 0, MARKED: 0, REDO: 0 };
  for (const e of students) c[rosterGroup(e)]++;
  return c;
}

/** Work to mark first, then sent back, then not handed in, then marked; by name inside each. */
export function sortRoster(students: readonly HandInEntry[]): HandInEntry[] {
  const order = { TO_MARK: 0, REDO: 1, NOT_HANDED: 2, MARKED: 3 } as const;
  return [...students].sort((a, b) => order[rosterGroup(a)] - order[rosterGroup(b)] || a.name.localeCompare(b.name));
}
