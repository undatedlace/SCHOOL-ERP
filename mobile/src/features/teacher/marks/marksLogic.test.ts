import {
  bandIndex,
  canPublish,
  changesOf,
  createBody,
  distributionOf,
  distributionSentence,
  draftsFrom,
  editRow,
  entriesFromDrafts,
  emptyEntry,
  emptyTestDraft,
  extremes,
  hasErrors,
  isLowMark,
  liveStats,
  markText,
  maxOf,
  nextStudentId,
  numberOf,
  parseMarks,
  percentText,
  problemsOf,
  recordEdit,
  subjectChoices,
  subjectsFor,
  undoLast,
  unsavedCount,
  validateTest,
  type Drafts,
  type TestOptions,
  type TestStudent,
} from './marksLogic';

const student = (id: string, name: string, extra: Partial<TestStudent> = {}): TestStudent => ({
  studentId: id,
  admissionNo: id.toUpperCase(),
  name,
  rollNo: null,
  marks: null,
  absent: false,
  remark: null,
  percent: null,
  ...extra,
});

describe('numbers from the API', () => {
  it('reads numbers and decimal text without trimming digits away', () => {
    expect(numberOf(10)).toBe(10);
    expect(numberOf('10')).toBe(10);
    expect(numberOf('7.50')).toBe(7.5);
    expect(numberOf(' 25.25 ')).toBe(25.25);
    expect(numberOf(null)).toBeNull();
    expect(numberOf('abc')).toBeNull();
    expect(numberOf(Number.NaN)).toBeNull();
  });

  it('reads the maximum whether it arrives as a number or as text', () => {
    expect(maxOf({ maxMarks: 10 })).toBe(10);
    expect(maxOf({ maxMarks: '10' })).toBe(10);
    expect(maxOf({ maxMarks: '12.5' })).toBe(12.5);
  });

  it('writes marks without trailing zeros', () => {
    expect(markText(18)).toBe('18');
    expect(markText(17.5)).toBe('17.5');
    expect(markText(7.25)).toBe('7.25');
  });
});

describe('parseMarks', () => {
  it('treats an empty box as no mark', () => {
    expect(parseMarks('', 10)).toEqual({ ok: true, value: null });
    expect(parseMarks('   ', 10)).toEqual({ ok: true, value: null });
  });

  it('reads whole and decimal marks up to the maximum, including the maximum itself', () => {
    expect(parseMarks('7', 10)).toEqual({ ok: true, value: 7 });
    expect(parseMarks('7.5', 10)).toEqual({ ok: true, value: 7.5 });
    expect(parseMarks('7,5', 10)).toEqual({ ok: true, value: 7.5 });
    expect(parseMarks('10', 10)).toEqual({ ok: true, value: 10 });
    expect(parseMarks('0', 10)).toEqual({ ok: true, value: 0 });
    expect(parseMarks('12.5', 12.5)).toEqual({ ok: true, value: 12.5 });
  });

  it('refuses more than the maximum, with the maximum in the message', () => {
    expect(parseMarks('10.01', 10)).toEqual({ ok: false, message: 'Cannot be more than 10' });
    expect(parseMarks('11', 10)).toEqual({ ok: false, message: 'Cannot be more than 10' });
    expect(parseMarks('30', 25.5)).toEqual({ ok: false, message: 'Cannot be more than 25.5' });
  });

  it('refuses letters, minus signs and more than two decimals', () => {
    expect(parseMarks('abc', 10).ok).toBe(false);
    expect(parseMarks('-1', 10).ok).toBe(false);
    expect(parseMarks('1e2', 10).ok).toBe(false);
    expect(parseMarks('7.123', 10)).toEqual({ ok: false, message: 'Use at most two decimal places' });
  });
});

describe('percentages and the Low flag', () => {
  it('writes the percentage to one decimal', () => {
    expect(percentText(7.5, 10)).toBe('75%');
    expect(percentText(1, 3)).toBe('33.3%');
    expect(percentText(null, 10)).toBeNull();
  });

  it('calls a mark Low only when it is under 40% of the maximum, exactly', () => {
    expect(isLowMark(3.9, 10)).toBe(true);
    expect(isLowMark(4, 10)).toBe(false);
    expect(isLowMark(0, 10)).toBe(true);
    expect(isLowMark(null, 10)).toBe(false);
    // 39.96% is below 40 even though it rounds up to 40.0.
    expect(isLowMark(9.99, 25)).toBe(true);
    expect(isLowMark(10, 25)).toBe(false);
  });
});

describe('what is typed against what is saved', () => {
  const students = [
    student('s1', 'Ayaan', { marks: 7.5, remark: 'Good' }),
    student('s2', 'Diya', { absent: true }),
    student('s3', 'Krish'),
  ];

  it('starts from the saved rows, with marks as text and none for an absent student', () => {
    expect(draftsFrom(students)).toEqual({
      s1: { marks: '7.5', absent: false, remark: 'Good' },
      s2: { marks: '', absent: true, remark: '' },
      s3: { marks: '', absent: false, remark: '' },
    });
  });

  it('sends nothing when nothing changed, and only the rows that did', () => {
    const drafts = draftsFrom(students);
    expect(changesOf(students, drafts, 10)).toEqual([]);
    expect(unsavedCount(students, drafts)).toBe(0);

    drafts.s3 = { marks: '4', absent: false, remark: ' keen ' };
    drafts.s1 = { marks: '8', absent: false, remark: 'Good' };
    expect(changesOf(students, drafts, 10)).toEqual([
      { studentId: 's1', marks: 8, absent: false, remark: 'Good' },
      { studentId: 's3', marks: 4, absent: false, remark: 'keen' },
    ]);
    expect(unsavedCount(students, drafts)).toBe(2);
  });

  it('sends an absent student without marks', () => {
    const drafts = draftsFrom(students);
    drafts.s3 = { marks: '5', absent: true, remark: '' };
    expect(changesOf(students, drafts, 10)).toEqual([{ studentId: 's3', absent: true, remark: '' }]);
  });

  it('sends a cleared box as no marks so a wrong mark can be taken away', () => {
    const drafts = draftsFrom(students);
    drafts.s1 = { marks: '', absent: false, remark: '' };
    expect(changesOf(students, drafts, 10)).toEqual([{ studentId: 's1', marks: null, absent: false, remark: '' }]);
  });

  it('leaves out a row that cannot be read and names the problem', () => {
    const drafts: Drafts = { ...draftsFrom(students), s3: { marks: '11', absent: false, remark: '' } };
    expect(changesOf(students, drafts, 10)).toEqual([]);
    expect(problemsOf(drafts, 10)).toEqual({ s3: 'Cannot be more than 10' });
  });

  it('does not complain about the marks box of an absent student', () => {
    const drafts: Drafts = { s3: { marks: 'zzz', absent: true, remark: '' } };
    expect(problemsOf(drafts, 10)).toEqual({});
  });
});

describe('live statistics', () => {
  const students = ['a', 'b', 'c', 'd', 'e'].map((id) => student(id, id));

  it('counts entered, average, highest and lowest, leaving the absent out of the average', () => {
    const drafts: Drafts = {
      a: { marks: '7.5', absent: false, remark: '' },
      b: { marks: '3', absent: false, remark: '' },
      c: { marks: '', absent: true, remark: '' },
      d: emptyEntry(),
      e: emptyEntry(),
    };
    expect(liveStats(students, drafts, 10)).toEqual({
      entered: 3,
      scored: 2,
      absent: 1,
      missing: 2,
      average: 5.3,
      highest: 7.5,
      lowest: 3,
    });
  });

  it('has no average, highest or lowest before any mark', () => {
    const s = liveStats(students, {}, 10);
    expect(s).toMatchObject({ entered: 0, scored: 0, missing: 5, average: null, highest: null, lowest: null });
  });

  it('ignores a box that cannot be read', () => {
    const s = liveStats(students, { a: { marks: '99', absent: false, remark: '' } }, 10);
    expect(s.scored).toBe(0);
  });
});

describe('distribution bands', () => {
  it('puts marks in the right band on the edges, compared exactly', () => {
    expect(bandIndex(3.9, 10)).toBe(0);
    expect(bandIndex(4, 10)).toBe(1);
    expect(bandIndex(4.9, 10)).toBe(1);
    expect(bandIndex(5, 10)).toBe(2);
    expect(bandIndex(6, 10)).toBe(3);
    expect(bandIndex(7, 10)).toBe(4);
    expect(bandIndex(8, 10)).toBe(5);
    expect(bandIndex(8.9, 10)).toBe(5);
    expect(bandIndex(9, 10)).toBe(6);
    expect(bandIndex(10, 10)).toBe(6);
    // 89.99% is the 80s even though it rounds to 90.
    expect(bandIndex(22.49, 25)).toBe(5);
    expect(bandIndex(22.5, 25)).toBe(6);
  });

  it('counts students per band and separates absent from not entered', () => {
    const students = [
      student('a', 'Asha', { marks: 9.5 }),
      student('b', 'Bilal', { marks: 9 }),
      student('c', 'Chitra', { marks: 5 }),
      student('d', 'Dev', { marks: 1 }),
      student('e', 'Esha', { absent: true }),
      student('f', 'Farid'),
    ];
    const d = distributionOf(students, 10);
    expect(d.bands.map((b) => b.count)).toEqual([1, 0, 1, 0, 0, 0, 2]);
    expect(d.bands.map((b) => b.label)).toEqual([
      'Below 40%',
      '40 to 49%',
      '50 to 59%',
      '60 to 69%',
      '70 to 79%',
      '80 to 89%',
      '90% and above',
    ]);
    expect(d.peak).toBe(2);
    expect(d).toMatchObject({ scored: 4, missing: 2, absent: 1, notEntered: 1 });
    expect(d.lowest.map((s) => s.name)).toEqual(['Dev', 'Chitra']);
    expect(d.highest.map((s) => s.name)).toEqual(['Asha', 'Bilal']);
  });

  it('reads marks that arrive as text', () => {
    const d = distributionOf([student('a', 'A', { marks: '9.5' })], 10);
    expect(d.scored).toBe(1);
  });

  it('describes the chart in words for a screen reader', () => {
    const d = distributionOf([student('a', 'A', { marks: 9 }), student('b', 'B')], 10);
    expect(distributionSentence(d)).toBe('Marks of 1 students. 90% and above: 1. Missing: 1.');
    expect(distributionSentence(distributionOf([], 10))).toBe('Nobody has marks yet.');
  });
});

describe('the distribution as typed', () => {
  it('uses what is typed, not what is saved, and ignores a box that cannot be read', () => {
    const students = [student('a', 'A', { marks: 2 }), student('b', 'B'), student('c', 'C')];
    const drafts: Drafts = {
      a: { marks: '9', absent: false, remark: '' },
      b: { marks: '99', absent: false, remark: '' },
      c: { marks: '', absent: true, remark: '' },
    };
    const shaped = entriesFromDrafts(students, drafts, 10);
    expect(shaped.map((s) => [s.marks, s.absent])).toEqual([[9, false], [null, false], [null, true]]);
    expect(distributionOf(shaped, 10)).toMatchObject({ scored: 1, absent: 1, notEntered: 1 });
  });
});

describe('the three lowest and highest', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `S${i}`, marks: i + 1 }));

  it('never lists the same student twice', () => {
    for (let n = 0; n <= 10; n++) {
      const { lowest, highest } = extremes(rows(n));
      const names = [...lowest, ...highest].map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
      expect(lowest.length).toBeLessThanOrEqual(3);
      expect(highest.length).toBeLessThanOrEqual(3);
      expect(lowest.length + highest.length).toBe(Math.min(n, 6));
    }
  });

  it('lists three of each when there are enough, lowest first and highest first', () => {
    const { lowest, highest } = extremes(rows(8));
    expect(lowest.map((s) => s.marks)).toEqual([1, 2, 3]);
    expect(highest.map((s) => s.marks)).toEqual([8, 7, 6]);
  });

  it('breaks ties by name', () => {
    const { lowest } = extremes([
      { name: 'Zed', marks: 2 },
      { name: 'Amy', marks: 2 },
    ]);
    expect(lowest[0]!.name).toBe('Amy');
  });
});

describe('undo', () => {
  it('puts a row back as it was, one edit at a time', () => {
    let drafts: Drafts = { a: emptyEntry(), b: emptyEntry() };
    let history: ReturnType<typeof recordEdit> = [];
    ({ drafts, history } = editRow(drafts, history, 'a', { marks: '7' }));
    ({ drafts, history } = editRow(drafts, history, 'b', { absent: true }));
    expect(drafts.b!.absent).toBe(true);

    let step = undoLast(drafts, history);
    expect(step.undone?.studentId).toBe('b');
    expect(step.drafts.b).toEqual(emptyEntry());
    expect(step.drafts.a!.marks).toBe('7');

    step = undoLast(step.drafts, step.history);
    expect(step.drafts.a).toEqual(emptyEntry());

    step = undoLast(step.drafts, step.history);
    expect(step.undone).toBeNull();
  });

  it('treats typing "7" then "7.5" in one row as one edit', () => {
    let drafts: Drafts = { a: emptyEntry() };
    let history: ReturnType<typeof recordEdit> = [];
    ({ drafts, history } = editRow(drafts, history, 'a', { marks: '7' }));
    ({ drafts, history } = editRow(drafts, history, 'a', { marks: '7.' }));
    ({ drafts, history } = editRow(drafts, history, 'a', { marks: '7.5' }));
    expect(history).toHaveLength(1);
    expect(undoLast(drafts, history).drafts.a).toEqual(emptyEntry());
  });

  it('does not record a change that changes nothing', () => {
    const drafts: Drafts = { a: { marks: '7', absent: false, remark: '' } };
    const out = editRow(drafts, [], 'a', { marks: '7' });
    expect(out.history).toEqual([]);
    expect(out.drafts).toBe(drafts);
  });

  it('keeps at most fifty edits', () => {
    let history: ReturnType<typeof recordEdit> = [];
    for (let i = 0; i < 80; i++) history = recordEdit(history, `s${i}`, emptyEntry());
    expect(history).toHaveLength(50);
    expect(history[0]!.studentId).toBe('s30');
  });
});

describe('the Next key', () => {
  const students = ['a', 'b', 'c', 'd'].map((id) => ({ studentId: id }));

  it('goes to the next student', () => {
    expect(nextStudentId(students, {}, 'a')).toBe('b');
    expect(nextStudentId(students, {}, 'c')).toBe('d');
  });

  it('skips a student who is absent', () => {
    const drafts: Drafts = { b: { marks: '', absent: true, remark: '' }, c: { marks: '', absent: true, remark: '' } };
    expect(nextStudentId(students, drafts, 'a')).toBe('d');
  });

  it('says there is no next after the last student, or when the rest are absent', () => {
    expect(nextStudentId(students, {}, 'd')).toBeNull();
    const drafts: Drafts = { d: { marks: '', absent: true, remark: '' } };
    expect(nextStudentId(students, drafts, 'c')).toBeNull();
    expect(nextStudentId(students, {}, 'zzz')).toBe('a');
  });
});

describe('the new-test form', () => {
  const options: TestOptions = {
    divisions: [
      { id: 'd1', label: 'Nursery-A', subjectIds: ['m', 'e'] },
      { id: 'd2', label: 'Nursery-B', subjectIds: ['h'] },
    ],
    subjects: [
      { id: 'm', name: 'Mathematics' },
      { id: 'e', name: 'English' },
      { id: 'h', name: 'Hindi' },
    ],
  };
  const today = '2026-11-15';

  it('offers only the subjects taught in the chosen class', () => {
    expect(subjectsFor(options, 'd1').map((s) => s.name)).toEqual(['Mathematics', 'English']);
    expect(subjectsFor(options, 'd2').map((s) => s.name)).toEqual(['Hindi']);
    expect(subjectsFor(options, 'zzz')).toEqual([]);
    expect(subjectsFor(undefined, 'd1')).toEqual([]);
  });

  it('lists the subjects across every class for the list filter, or those of one class', () => {
    expect(subjectChoices(options, 'all').map((s) => s.name)).toEqual(['Mathematics', 'English', 'Hindi']);
    expect(subjectChoices(options, 'd2').map((s) => s.name)).toEqual(['Hindi']);
    expect(subjectChoices(undefined, 'all')).toEqual([]);
  });

  it('asks for what is missing', () => {
    const errors = validateTest(emptyTestDraft(today), options, today);
    expect(errors).toMatchObject({
      name: expect.any(String),
      divisionId: 'Choose a class',
      subjectId: 'Choose a subject',
      maxMarks: expect.any(String),
    });
    expect(errors.conductedOn).toBeUndefined();
  });

  it('accepts a good test and builds the body with the maximum as a number', () => {
    const draft = { ...emptyTestDraft(today), name: ' Unit Test 1 ', divisionId: 'd1', subjectId: 'm', maxMarks: '25,5', kind: 'MOCK' as const };
    expect(hasErrors(validateTest(draft, options, today))).toBe(false);
    expect(createBody(draft)).toEqual({
      name: 'Unit Test 1',
      kind: 'MOCK',
      divisionId: 'd1',
      subjectId: 'm',
      maxMarks: 25.5,
      conductedOn: today,
    });
  });

  it('refuses a subject the teacher does not teach in that class, a future day and a bad maximum', () => {
    const base = { ...emptyTestDraft(today), name: 'Test', divisionId: 'd2', subjectId: 'm', maxMarks: '10' };
    expect(validateTest(base, options, today).subjectId).toMatch(/do not teach/);
    expect(validateTest({ ...base, subjectId: 'h', conductedOn: '2026-11-16' }, options, today).conductedOn).toMatch(/future/);
    expect(validateTest({ ...base, subjectId: 'h', maxMarks: '0' }, options, today).maxMarks).toMatch(/more than zero/);
    expect(validateTest({ ...base, subjectId: 'h', maxMarks: '1001' }, options, today).maxMarks).toMatch(/1000/);
    expect(validateTest({ ...base, subjectId: 'h', maxMarks: '1.234' }, options, today).maxMarks).toBeDefined();
  });
});

describe('publishing', () => {
  it('needs at least one entry and nothing unsaved', () => {
    expect(canPublish(0, 0)).toBe(false);
    expect(canPublish(3, 1)).toBe(false);
    expect(canPublish(3, 0)).toBe(true);
  });
});
