import {
  NO_FILTERS,
  audienceText,
  awaitingMarking,
  bucketOf,
  createBody,
  draftFrom,
  dueText,
  emptyDraft,
  handedInText,
  markedProgressText,
  markedShare,
  markingQueue,
  parseMarks,
  reviewBody,
  reviewProblem,
  rosterCounts,
  sortRoster,
  statsFromRoster,
  tabCounts,
  toggleId,
  trimNumber,
  updateBody,
  validateDraft,
  visibleItems,
  type HomeworkStats,
} from './homeworkLogic';
import type { HandInEntry, Submission, TeacherHomework } from './types';

const TODAY = '2026-11-14';

const hw = (id: string, over: Partial<TeacherHomework> = {}): TeacherHomework => ({
  id,
  title: `Task ${id}`,
  instructions: 'Do it',
  subject: { id: 'eng', name: 'English' },
  dueOn: '2026-11-20',
  overdue: false,
  createdBy: { id: 'u', fullName: 'Teacher' },
  createdAt: `2026-11-1${id.length}T08:00:00.000Z`,
  handIn: true,
  maxMarks: '10.00',
  attachments: [],
  children: [],
  forChildren: [],
  divisions: [{ id: 'd1', label: 'Nursery-A' }],
  students: [],
  canChange: true,
  ...over,
});

const sub = (status: Submission['status']): Submission => ({
  id: 's',
  studentId: 'x',
  status,
  note: null,
  submittedAt: '2026-11-13T08:00:00.000Z',
  late: false,
  files: [],
  marks: null,
  feedback: null,
  reviewedAt: null,
});

const entry = (name: string, submission: Submission | null): HandInEntry => ({
  studentId: name,
  name,
  admissionNo: name,
  division: 'Nursery-A',
  submission,
});

const stats = (over: Partial<HomeworkStats> = {}): HomeworkStats => ({ students: 24, handedIn: 0, toMark: 0, marked: 0, redo: 0, ...over });

describe('statsFromRoster', () => {
  it('counts work waiting, marked and sent back', () => {
    const s = statsFromRoster({
      students: [
        entry('a', sub('SUBMITTED')),
        entry('b', sub('SUBMITTED')),
        entry('c', sub('REVIEWED')),
        entry('d', sub('REDO')),
        entry('e', null),
      ],
    });
    expect(s).toEqual({ students: 5, handedIn: 3, toMark: 2, marked: 1, redo: 1 });
  });

  it('writes the progress words', () => {
    const s = stats({ handedIn: 24, marked: 15, toMark: 9 });
    expect(handedInText(s)).toBe('24 of 24 handed in');
    expect(markedProgressText(s)).toBe('15 of 24 marked');
    expect(markedShare(s)).toBeCloseTo(0.625);
    expect(markedShare(stats())).toBe(1);
  });
});

describe('tabs', () => {
  const items = [
    hw('a', { dueOn: '2026-11-20' }), // open
    hw('b', { dueOn: '2026-11-10' }), // past due, work waiting
    hw('c', { dueOn: '2026-11-10' }), // past due, all marked
    hw('d', { dueOn: null, subject: { id: 'evs', name: 'EVS' }, divisions: [{ id: 'd2', label: 'Nursery-B' }] }),
  ];
  const map = new Map<string, HomeworkStats>([
    ['a', stats({ handedIn: 3, marked: 3 })],
    ['b', stats({ handedIn: 5, toMark: 2, marked: 3 })],
    ['c', stats({ handedIn: 5, marked: 5 })],
  ]);

  it('puts a task with work waiting under To mark, however old', () => {
    expect(bucketOf(items[1]!, map.get('b'), TODAY)).toBe('TO_MARK');
    expect(bucketOf(items[0]!, map.get('a'), TODAY)).toBe('OPEN');
    expect(bucketOf(items[2]!, map.get('c'), TODAY)).toBe('MARKED');
    expect(bucketOf(items[3]!, undefined, TODAY)).toBe('OPEN');
    expect(bucketOf(items[2]!, undefined, TODAY)).toBe('MARKED');
  });

  it('counts each tab', () => {
    expect(tabCounts(items, map, NO_FILTERS, TODAY)).toEqual({ ALL: 4, TO_MARK: 1, OPEN: 2, MARKED: 1 });
  });

  it('applies the division and subject filters to the counts and the list', () => {
    const evs = { ...NO_FILTERS, subjectId: 'evs' };
    expect(tabCounts(items, map, evs, TODAY).ALL).toBe(1);
    const nurseryB = { ...NO_FILTERS, divisionId: 'd2' };
    expect(visibleItems(items, map, nurseryB, TODAY).map((i) => i.id)).toEqual(['d']);
    expect(visibleItems(items, map, { ...NO_FILTERS, tab: 'MARKED' }, TODAY).map((i) => i.id)).toEqual(['c']);
  });

  it('lists work to mark first, then by due day, tasks with no day last', () => {
    expect(visibleItems(items, map, NO_FILTERS, TODAY).map((i) => i.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('markingQueue', () => {
  it('keeps tasks with work waiting, the oldest due day first', () => {
    const items = [hw('a', { dueOn: '2026-11-20' }), hw('b', { dueOn: '2026-11-10' }), hw('c', { dueOn: null }), hw('d')];
    const map = new Map<string, HomeworkStats>([
      ['a', stats({ handedIn: 4, toMark: 1, marked: 3 })],
      ['b', stats({ handedIn: 24, toMark: 9, marked: 15 })],
      ['c', stats({ handedIn: 2, toMark: 2 })],
      ['d', stats({ handedIn: 2, marked: 2 })],
    ]);
    const queue = markingQueue(items, map);
    expect(queue.map((q) => q.homework.id)).toEqual(['b', 'a', 'c']);
    expect(awaitingMarking(queue)).toBe(12);
    expect(markedProgressText(queue[0]!.stats)).toBe('15 of 24 marked');
  });
});

describe('dueText and audienceText', () => {
  it('writes the due day', () => {
    expect(dueText(null, TODAY)).toBe('No due day');
    expect(dueText(TODAY, TODAY)).toBe('Due today');
    expect(dueText('2026-11-20', TODAY)).toBe('Due 20 Nov');
    expect(dueText('2026-11-10', TODAY)).toBe('Due 10 Nov (past)');
  });

  it('writes who it is for', () => {
    expect(audienceText({ divisions: [{ id: '1', label: 'Nursery-A' }], students: [] })).toBe('Nursery-A');
    expect(audienceText({ divisions: [], students: [{ id: '1', name: 'Ayaan' }] })).toBe('Ayaan');
    expect(
      audienceText({ divisions: [{ id: '1', label: 'Nursery-A' }], students: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }] }),
    ).toBe('Nursery-A and 2 students');
  });
});

describe('the form', () => {
  const filled = () => ({ ...emptyDraft(), title: 'Draw a tree', instructions: 'Use crayons', divisionIds: ['d1'] });

  it('accepts a complete draft', () => {
    expect(validateDraft(filled(), TODAY, false)).toEqual({});
  });

  it('asks for a title, instructions and an audience', () => {
    const e = validateDraft(emptyDraft(), TODAY, false);
    expect(e).toMatchObject({
      title: 'Give the homework a title.',
      instructions: 'Write what the students should do.',
      audience: 'Choose who it is for.',
    });
  });

  it('refuses a due day in the past when setting, but not when changing', () => {
    const d = { ...filled(), dueOn: '2026-11-01' };
    expect(validateDraft(d, TODAY, false).dueOn).toBeDefined();
    expect(validateDraft(d, TODAY, true).dueOn).toBeUndefined();
  });

  it('allows marks only when students hand in, and only a sensible number', () => {
    expect(validateDraft({ ...filled(), maxMarks: '10' }, TODAY, false).maxMarks).toMatch(/hand work in/);
    expect(validateDraft({ ...filled(), handIn: true, maxMarks: '10' }, TODAY, false)).toEqual({});
    expect(validateDraft({ ...filled(), handIn: true, maxMarks: '0' }, TODAY, false).maxMarks).toBeDefined();
    expect(validateDraft({ ...filled(), handIn: true, maxMarks: '1001' }, TODAY, false).maxMarks).toBeDefined();
    expect(validateDraft({ ...filled(), handIn: true, maxMarks: '9.999' }, TODAY, false).maxMarks).toBeDefined();
    expect(parseMarks('7.5')).toBe(7.5);
    expect(parseMarks('abc')).toBeNull();
  });

  it('builds the body to create, leaving out what is empty', () => {
    expect(createBody(filled(), [])).toEqual({
      title: 'Draw a tree',
      instructions: 'Use crayons',
      handIn: false,
      divisionIds: ['d1'],
    });
    const full = { ...filled(), subjectId: 'eng', dueOn: '2026-11-20', handIn: true, maxMarks: '10', studentIds: ['s1'] };
    expect(createBody(full, ['f1'])).toEqual({
      title: 'Draw a tree',
      instructions: 'Use crayons',
      subjectId: 'eng',
      dueOn: '2026-11-20',
      handIn: true,
      maxMarks: 10,
      attachmentFileIds: ['f1'],
      divisionIds: ['d1'],
      studentIds: ['s1'],
    });
  });

  it('builds the body to change: an empty due day removes it, files are the full list', () => {
    expect(updateBody({ ...filled(), dueOn: null }, ['f1'])).toMatchObject({ dueOn: '', attachmentFileIds: ['f1'] });
    expect(updateBody({ ...filled(), dueOn: '2026-11-21' }, [])).toMatchObject({ dueOn: '2026-11-21', attachmentFileIds: [] });
  });

  it('starts a change from the saved task', () => {
    const d = draftFrom(hw('a', { students: [{ id: 's1', name: 'Ayaan' }] }));
    expect(d).toMatchObject({ title: 'Task a', maxMarks: '10', handIn: true, divisionIds: ['d1'], studentIds: ['s1'] });
  });

  it('toggles an id in a list', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('trimNumber', () => {
  it('drops trailing zeros after a decimal point and never from a whole number', () => {
    expect(trimNumber('10.00')).toBe('10');
    expect(trimNumber('7.50')).toBe('7.5');
    expect(trimNumber('10')).toBe('10');
    expect(trimNumber('100')).toBe('100');
  });

  it('reads the maximum the way the API sends it (whole numbers have no decimals)', () => {
    expect(reviewProblem({ action: 'REVIEWED', marks: '11', maxMarks: '10', feedback: '' })).toBe('Marks cannot be more than 10.');
    expect(draftFrom(hw('a', { maxMarks: '10' })).maxMarks).toBe('10');
    expect(draftFrom(hw('a', { maxMarks: '7.5' })).maxMarks).toBe('7.5');
  });
});

describe('marking a hand-in', () => {
  it('needs a comment to send work back', () => {
    expect(reviewProblem({ action: 'REDO', marks: '', maxMarks: '10.00', feedback: ' ' })).toBe('Say what should be done again.');
    expect(reviewProblem({ action: 'REDO', marks: '', maxMarks: '10.00', feedback: 'Redo page 2' })).toBeNull();
  });

  it('accepts marks up to the maximum, or none', () => {
    expect(reviewProblem({ action: 'REVIEWED', marks: '', maxMarks: '10.00', feedback: '' })).toBeNull();
    expect(reviewProblem({ action: 'REVIEWED', marks: '10', maxMarks: '10.00', feedback: '' })).toBeNull();
    expect(reviewProblem({ action: 'REVIEWED', marks: '11', maxMarks: '10.00', feedback: '' })).toBe('Marks cannot be more than 10.');
    expect(reviewProblem({ action: 'REVIEWED', marks: 'abc', maxMarks: '10.00', feedback: '' })).toMatch(/number/);
    expect(reviewProblem({ action: 'REVIEWED', marks: '5', maxMarks: null, feedback: '' })).toBe('This homework has no marks.');
  });

  it('sends marks only with a marking, and the comment only when there is one', () => {
    expect(reviewBody({ action: 'REVIEWED', marks: '7.5', maxMarks: '10.00', feedback: ' Well done ' })).toEqual({
      status: 'REVIEWED',
      marks: 7.5,
      feedback: 'Well done',
    });
    expect(reviewBody({ action: 'REDO', marks: '7', maxMarks: '10.00', feedback: 'Again' })).toEqual({ status: 'REDO', feedback: 'Again' });
    expect(reviewBody({ action: 'REVIEWED', marks: '', maxMarks: null, feedback: '' })).toEqual({ status: 'REVIEWED' });
  });
});

describe('the roster', () => {
  const students = [entry('Zed', null), entry('Amy', sub('REVIEWED')), entry('Bob', sub('SUBMITTED')), entry('Cal', sub('REDO')), entry('Abe', sub('SUBMITTED'))];

  it('counts each group', () => {
    expect(rosterCounts(students)).toEqual({ ALL: 5, TO_MARK: 2, NOT_HANDED: 1, MARKED: 1, REDO: 1 });
  });

  it('lists work to mark first, then sent back, not handed in, then marked', () => {
    expect(sortRoster(students).map((s) => s.name)).toEqual(['Abe', 'Bob', 'Cal', 'Zed', 'Amy']);
  });
});
