import type { StudentLeave } from '@/features/absence/logic';
import { classLine, decisionBody, decisionProblem, waitingForMe } from './studentLeaveLogic';

const leave = (over: Partial<StudentLeave>): StudentLeave => ({
  id: 'r',
  student: { id: 's', name: 'Ayaan Khan', className: 'Nursery', divisionName: 'A' },
  fromDate: '2026-11-16',
  toDate: '2026-11-16',
  halfDay: false,
  days: 1,
  reason: 'Fever',
  status: 'PENDING',
  requestedBy: null,
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  withdrawnAt: null,
  createdAt: '2026-11-14T08:00:00.000Z',
  canWithdraw: false,
  canDecide: true,
  ...over,
});

describe('waitingForMe', () => {
  it('keeps waiting requests the teacher may decide, soonest first', () => {
    const items = [
      leave({ id: 'late', fromDate: '2026-11-20' }),
      leave({ id: 'approved', status: 'APPROVED' }),
      leave({ id: 'not-mine', canDecide: false }),
      leave({ id: 'soon', fromDate: '2026-11-16' }),
    ];
    expect(waitingForMe(items).map((r) => r.id)).toEqual(['soon', 'late']);
  });

  it('puts the earlier request first when two start on the same day', () => {
    const items = [leave({ id: 'b', createdAt: '2026-11-14T10:00:00.000Z' }), leave({ id: 'a' })];
    expect(waitingForMe(items).map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('decisions', () => {
  it('requires a reason to refuse, and nothing to approve', () => {
    expect(decisionProblem(false, '   ')).toBe('Say why the leave is not approved.');
    expect(decisionProblem(false, 'Exam day')).toBeNull();
    expect(decisionProblem(true, '')).toBeNull();
  });

  it('sends the note only when there is one', () => {
    expect(decisionBody(true, '')).toEqual({ approve: true });
    expect(decisionBody(false, '  Exam day ')).toEqual({ approve: false, note: 'Exam day' });
    expect(decisionBody(false, 'x'.repeat(400)).note).toHaveLength(300);
  });

  it('writes the class line', () => {
    expect(classLine({ className: 'Nursery', divisionName: 'A' })).toBe('Nursery-A');
    expect(classLine({ className: null, divisionName: null })).toBe('');
  });
});
