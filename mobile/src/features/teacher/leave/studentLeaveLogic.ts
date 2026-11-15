/**
 * Student leave waiting for a teacher: which requests the card shows and what a decision sends.
 * The API decides who may decide (`canDecide`); the app only lists what it says is open.
 */
import type { StudentLeave } from '@/features/absence/logic';

export const DECISION_NOTE_MAX = 300;

/** Waiting requests this teacher may decide, the ones starting soonest first. */
export function waitingForMe(items: readonly StudentLeave[]): StudentLeave[] {
  return items
    .filter((r) => r.status === 'PENDING' && r.canDecide)
    .sort((a, b) => (a.fromDate === b.fromDate ? (a.createdAt < b.createdAt ? -1 : 1) : a.fromDate < b.fromDate ? -1 : 1));
}

/** The class line under a child's name: "Nursery-A". */
export function classLine(s: Pick<StudentLeave['student'], 'className' | 'divisionName'>): string {
  return [s.className, s.divisionName].filter(Boolean).join('-');
}

/** A refusal needs a reason; an approval needs nothing. Returns the sentence to show, or null. */
export function decisionProblem(approve: boolean, note: string): string | null {
  if (approve) return null;
  return note.trim() ? null : 'Say why the leave is not approved.';
}

/** The body of `POST /student-leave/:id/decision`. */
export function decisionBody(approve: boolean, note: string): { approve: boolean; note?: string } {
  const text = note.trim().slice(0, DECISION_NOTE_MAX);
  return text ? { approve, note: text } : { approve };
}
