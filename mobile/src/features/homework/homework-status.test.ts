import {
  bucketOf,
  canHandIn,
  canTakeBack,
  childSubmission,
  countByBucket,
  dueInfo,
  dueLabel,
  entriesFor,
  isFinished,
  marksText,
  sortByDue,
  statusBadge,
  subjectsOf,
} from './homework-status';
import type { Homework, Submission } from './types';

const TODAY = '2026-11-14';

function sub(over: Partial<Submission> = {}): Submission {
  return {
    id: 's1',
    studentId: 'st1',
    status: 'SUBMITTED',
    note: null,
    submittedAt: '2026-11-13T05:00:00.000Z',
    late: false,
    files: [],
    marks: null,
    feedback: null,
    reviewedAt: null,
    ...over,
  };
}

function hw(over: Partial<Homework> = {}, submission: Submission | null = null): Homework {
  return {
    id: 'h1',
    title: 'Counting to 20',
    instructions: 'Do it',
    subject: { id: 'sub-math', name: 'Mathematics' },
    dueOn: '2026-11-16',
    overdue: false,
    createdBy: { id: 't1', fullName: 'Teacher' },
    createdAt: '2026-11-10T05:00:00.000Z',
    handIn: true,
    maxMarks: '10.00',
    attachments: [],
    children: [{ studentId: 'st1', name: 'Ayaan', submission }],
    forChildren: ['Ayaan'],
    ...over,
  };
}

describe('bucketOf', () => {
  it('puts unhanded and sent-back work in To do', () => {
    expect(bucketOf(null)).toBe('TODO');
    expect(bucketOf(sub({ status: 'REDO' }))).toBe('TODO');
  });
  it('separates handed in from marked', () => {
    expect(bucketOf(sub({ status: 'SUBMITTED' }))).toBe('HANDED_IN');
    expect(bucketOf(sub({ status: 'REVIEWED' }))).toBe('MARKED');
  });
});

describe('childSubmission', () => {
  it('finds the hand-in of the named child, or the first child', () => {
    const s = sub();
    expect(childSubmission(hw({}, s), 'st1')).toBe(s);
    expect(childSubmission(hw({}, s), 'other')).toBe(s);
    expect(childSubmission(hw({ children: [] }), 'st1')).toBeNull();
  });
});

describe('dueInfo and dueLabel', () => {
  it('names today, tomorrow and yesterday', () => {
    expect(dueInfo('2026-11-14', TODAY)).toEqual({ text: 'Today', overdue: false });
    expect(dueInfo('2026-11-15', TODAY)).toEqual({ text: 'Tomorrow', overdue: false });
    expect(dueInfo('2026-11-13', TODAY)).toEqual({ text: 'Yesterday', overdue: true });
  });
  it('writes other days as dates and marks past ones overdue', () => {
    expect(dueInfo('2026-11-20', TODAY)).toEqual({ text: '20 Nov', overdue: false });
    expect(dueInfo('2026-11-02', TODAY)).toEqual({ text: '2 Nov', overdue: true });
    expect(dueInfo('2027-01-05', TODAY)).toEqual({ text: '5 Jan 2027', overdue: false });
    expect(dueInfo(null, TODAY)).toBeNull();
  });
  it('builds the label', () => {
    expect(dueLabel('2026-11-14', TODAY)).toBe('Due today');
    expect(dueLabel('2026-11-15', TODAY)).toBe('Due tomorrow');
    expect(dueLabel('2026-11-20', TODAY)).toBe('Due 20 Nov');
    expect(dueLabel('2026-11-13', TODAY)).toBe('Overdue, yesterday');
    expect(dueLabel('2026-11-02', TODAY)).toBe('Overdue, 2 Nov');
    expect(dueLabel(null, TODAY)).toBe('No due date');
  });
});

describe('marksText', () => {
  it('drops trailing zeros', () => {
    expect(marksText('8.00', '10.00')).toBe('8/10');
    expect(marksText('7.50', '10.00')).toBe('7.5/10');
    expect(marksText('0.00', '10')).toBe('0/10');
    expect(marksText('100.00', '100.00')).toBe('100/100');
  });
  it('copes with missing marks or maximum', () => {
    expect(marksText(null, '10.00')).toBeNull();
    expect(marksText('8.00', null)).toBe('8');
    expect(marksText('abc', '10')).toBeNull();
  });
});

describe('statusBadge', () => {
  it('says what is going on, in words', () => {
    expect(statusBadge(hw(), null, TODAY)).toEqual({ label: 'Not handed in', tone: 'neutral' });
    expect(statusBadge(hw({ dueOn: '2026-11-10' }), null, TODAY)).toEqual({ label: 'Not handed in', tone: 'bad' });
    expect(statusBadge(hw({ handIn: false }), null, TODAY).label).toBe('No hand-in');
    expect(statusBadge(hw(), sub(), TODAY)).toEqual({ label: 'Handed in', tone: 'info' });
    expect(statusBadge(hw(), sub({ late: true }), TODAY)).toEqual({ label: 'Handed in late', tone: 'warn' });
    expect(statusBadge(hw(), sub({ status: 'REDO' }), TODAY)).toEqual({ label: 'Sent back', tone: 'warn' });
    expect(statusBadge(hw(), sub({ status: 'REVIEWED', marks: '8.00' }), TODAY)).toEqual({ label: 'Marked 8/10', tone: 'good' });
    expect(statusBadge(hw(), sub({ status: 'REVIEWED' }), TODAY).label).toBe('Marked');
  });
});

describe('isFinished', () => {
  it('drops past homework that needs no hand-in', () => {
    expect(isFinished(hw({ handIn: false, dueOn: '2026-11-10' }), null, TODAY)).toBe(true);
    expect(isFinished(hw({ handIn: false, dueOn: '2026-11-14' }), null, TODAY)).toBe(false);
    expect(isFinished(hw({ handIn: false, dueOn: null }), null, TODAY)).toBe(false);
  });
  it('keeps work that should have been handed in', () => {
    expect(isFinished(hw({ handIn: true, dueOn: '2026-11-10' }), null, TODAY)).toBe(false);
  });
});

describe('sortByDue', () => {
  it('puts the soonest first and undated last', () => {
    const items = [
      { title: 'c', dueOn: null, createdAt: '2026-11-01' },
      { title: 'b', dueOn: '2026-11-20', createdAt: '2026-11-01' },
      { title: 'a', dueOn: '2026-11-10', createdAt: '2026-11-01' },
      { title: 'd', dueOn: '2026-11-20', createdAt: '2026-11-05' },
    ];
    expect(sortByDue(items).map((i) => i.title)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('hand-in rules', () => {
  it('lets a child hand in, or hand in again after a send-back', () => {
    expect(canHandIn(hw(), null)).toBe(true);
    expect(canHandIn(hw(), sub({ status: 'REDO' }))).toBe(true);
  });
  it('refuses once handed in, once marked, or when hand-in is off', () => {
    expect(canHandIn(hw(), sub())).toBe(false);
    expect(canHandIn(hw(), sub({ status: 'REVIEWED' }))).toBe(false);
    expect(canHandIn(hw({ handIn: false }), null)).toBe(false);
  });
  it('lets a hand-in be taken back until it is marked', () => {
    expect(canTakeBack(sub())).toBe(true);
    expect(canTakeBack(sub({ status: 'REVIEWED' }))).toBe(false);
    expect(canTakeBack(sub({ status: 'REDO' }))).toBe(false);
    expect(canTakeBack(null)).toBe(false);
  });
});

describe('entries, counts and subjects', () => {
  const items = [
    hw({ id: 'a' }),
    hw({ id: 'b', subject: { id: 'sub-eng', name: 'English' } }, sub()),
    hw({ id: 'c' }, sub({ status: 'REVIEWED' })),
    hw({ id: 'd', handIn: false, dueOn: '2026-11-01' }),
  ];
  const entries = entriesFor(items, 'st1', TODAY);

  it('removes finished work', () => {
    expect(entries.map((e) => e.hw.id)).toEqual(['a', 'b', 'c']);
  });
  it('counts each list', () => {
    expect(countByBucket(entries)).toEqual({ TODO: 1, HANDED_IN: 1, MARKED: 1 });
  });
  it('lists subjects once, in order', () => {
    expect(subjectsOf(entries)).toEqual([
      { id: 'sub-eng', name: 'English' },
      { id: 'sub-math', name: 'Mathematics' },
    ]);
  });
});
