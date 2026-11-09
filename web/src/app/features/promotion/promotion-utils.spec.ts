import { PromotionPlan } from '../../core/models';
import { choicesFrom, counts, entries, missingDivision, targets } from './promotion-utils';

const plan = (): PromotionPlan => ({
  from: { id: 'y1', name: '2026-27' },
  to: { id: 'y2', name: '2027-28' },
  division: { id: 'd1', name: 'A', class: { id: 'c1', name: 'Std 1' } },
  nextClass: { id: 'c2', name: 'Std 2', divisions: [{ id: 'd2a', name: 'A' }] },
  sameClassDivisions: [
    { id: 'd1', name: 'A' },
    { id: 'd1b', name: 'B' },
  ],
  alreadyDone: 0,
  students: [
    {
      studentId: 's1',
      admissionNo: '1',
      name: 'One',
      rollNo: null,
      suggested: { action: 'PROMOTE', divisionId: 'd2a' },
    },
    {
      studentId: 's2',
      admissionNo: '2',
      name: 'Two',
      rollNo: null,
      suggested: { action: 'PROMOTE', divisionId: null },
    },
  ],
});

describe('promotion utils', () => {
  it('starts from the suggestions', () => {
    const c = choicesFrom(plan());
    expect(c['s1']).toEqual({ action: 'PROMOTE', divisionId: 'd2a' });
    expect(counts(plan(), c)).toEqual({ PROMOTE: 2, REPEAT: 0, LEFT: 0 });
  });

  it('offers the next class, the same class, or nothing, by action', () => {
    expect(targets(plan(), 'PROMOTE').map((d) => d.id)).toEqual(['d2a']);
    expect(targets(plan(), 'REPEAT').map((d) => d.id)).toEqual(['d1', 'd1b']);
    expect(targets(plan(), 'LEFT')).toEqual([]);
    expect(targets({ ...plan(), nextClass: null }, 'PROMOTE')).toEqual([]);
  });

  it('counts students who still need a division, and not those who are leaving', () => {
    const c = choicesFrom(plan());
    expect(missingDivision(plan(), c)).toBe(1);
    c['s2'] = { action: 'LEFT', divisionId: null };
    expect(missingDivision(plan(), c)).toBe(0);
  });

  it('sends a division only where one is needed', () => {
    const c = choicesFrom(plan());
    c['s2'] = { action: 'LEFT', divisionId: 'ignored' };
    expect(entries(plan(), c)).toEqual([
      { studentId: 's1', action: 'PROMOTE', divisionId: 'd2a' },
      { studentId: 's2', action: 'LEFT' },
    ]);
  });
});
