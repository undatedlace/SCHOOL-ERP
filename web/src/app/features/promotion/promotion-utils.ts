import { PromotionAction, PromotionPlan } from '../../core/models';

export const ACTIONS: { value: PromotionAction; label: string }[] = [
  { value: 'PROMOTE', label: 'Moves up' },
  { value: 'REPEAT', label: 'Stays in class' },
  { value: 'LEFT', label: 'Leaves school' },
];

/** What the office has chosen for each student. */
export type Choices = Record<string, { action: PromotionAction; divisionId: string | null }>;

export const choicesFrom = (plan: PromotionPlan): Choices =>
  Object.fromEntries(
    plan.students.map((s) => [
      s.studentId,
      { action: s.suggested.action, divisionId: s.suggested.divisionId },
    ]),
  );

/** The divisions a student can go to for an action. Leaving has none. */
export function targets(plan: PromotionPlan, action: PromotionAction) {
  if (action === 'PROMOTE') return plan.nextClass?.divisions ?? [];
  if (action === 'REPEAT') return plan.sameClassDivisions;
  return [];
}

/** Students who still need a division chosen (so the button stays off until they have one). */
export function missingDivision(plan: PromotionPlan, choices: Choices): number {
  return plan.students.filter((s) => {
    const c = choices[s.studentId];
    return c && c.action !== 'LEFT' && !c.divisionId;
  }).length;
}

/** The request body entries: a division is sent only for the actions that need one. */
export function entries(plan: PromotionPlan, choices: Choices) {
  return plan.students.map((s) => {
    const c = choices[s.studentId];
    return c.action === 'LEFT'
      ? { studentId: s.studentId, action: c.action }
      : { studentId: s.studentId, action: c.action, divisionId: c.divisionId ?? undefined };
  });
}

export function counts(plan: PromotionPlan, choices: Choices) {
  const n = { PROMOTE: 0, REPEAT: 0, LEFT: 0 };
  for (const s of plan.students) n[choices[s.studentId].action]++;
  return n;
}
