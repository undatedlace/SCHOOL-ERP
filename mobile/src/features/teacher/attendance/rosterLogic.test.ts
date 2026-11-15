import {
  LEAVE_NOTE,
  changesOf,
  countsOf,
  dateParam,
  dayChipLabel,
  draftsFrom,
  editableDays,
  flaggedText,
  isEditableDay,
  lowestFirst,
  markEveryonePresent,
  registerState,
  reportQuery,
  reportSummary,
  setNote,
  setStatus,
  type ReportStudent,
  type RosterStudent,
} from './rosterLogic';

const student = (id: string, over: Partial<RosterStudent> = {}): RosterStudent => ({
  studentId: id,
  admissionNo: id.toUpperCase(),
  name: `Student ${id}`,
  rollNo: null,
  status: null,
  note: null,
  approvedLeave: null,
  suggestedStatus: null,
  ...over,
});

const roster = (students: RosterStudent[]) => ({ students });

describe('draftsFrom', () => {
  it('starts from what is saved', () => {
    const d = draftsFrom(roster([student('a', { status: 'ABSENT', note: 'Fever' })]));
    expect(d.a).toEqual({ status: 'ABSENT', note: 'Fever' });
  });

  it('pre-selects approved leave as Leave with the note "Leave approved"', () => {
    const d = draftsFrom(
      roster([student('a', { approvedLeave: { requestId: 'r', halfDay: false }, suggestedStatus: 'ON_LEAVE' })]),
    );
    expect(d.a).toEqual({ status: 'ON_LEAVE', note: LEAVE_NOTE });
  });

  it('leaves a student with nothing saved and no leave blank', () => {
    expect(draftsFrom(roster([student('a')])).a).toEqual({ status: null, note: '' });
  });

  it('never replaces a saved mark with the suggestion', () => {
    const d = draftsFrom(roster([student('a', { status: 'PRESENT', suggestedStatus: 'ON_LEAVE' })]));
    expect(d.a?.status).toBe('PRESENT');
  });
});

describe('markEveryonePresent', () => {
  it('makes only the blanks present and keeps every other choice', () => {
    const r = roster([student('a'), student('b'), student('c', { suggestedStatus: 'ON_LEAVE' })]);
    let d = draftsFrom(r);
    d = setStatus(d, 'b', 'LATE');
    const all = markEveryonePresent(r, d);
    expect(all.a?.status).toBe('PRESENT');
    expect(all.b?.status).toBe('LATE');
    expect(all.c?.status).toBe('ON_LEAVE');
  });

  it('keeps a note typed before the mark', () => {
    const r = roster([student('a')]);
    const d = markEveryonePresent(r, setNote(draftsFrom(r), 'a', 'came by bus'));
    expect(d.a).toEqual({ status: 'PRESENT', note: 'came by bus' });
  });
});

describe('changesOf', () => {
  it('sends only the students whose mark or note differs from what is saved', () => {
    const r = roster([
      student('a', { status: 'PRESENT' }),
      student('b', { status: 'PRESENT' }),
      student('c'),
      student('d', { suggestedStatus: 'ON_LEAVE' }),
    ]);
    let d = draftsFrom(r);
    d = setStatus(d, 'b', 'ABSENT');
    d = setNote(d, 'b', '  fever  ');
    d = setStatus(d, 'c', 'PRESENT');
    expect(changesOf(r, d)).toEqual([
      { studentId: 'b', status: 'ABSENT', note: 'fever' },
      { studentId: 'c', status: 'PRESENT' },
      { studentId: 'd', status: 'ON_LEAVE', note: LEAVE_NOTE },
    ]);
  });

  it('sends nothing when nothing changed, and never a student with no mark', () => {
    const r = roster([student('a', { status: 'LATE' }), student('b')]);
    expect(changesOf(r, draftsFrom(r))).toEqual([]);
  });

  it('sends a changed note on its own', () => {
    const r = roster([student('a', { status: 'ABSENT', note: 'sick' })]);
    expect(changesOf(r, setNote(draftsFrom(r), 'a', 'sick, doctor visit'))).toEqual([
      { studentId: 'a', status: 'ABSENT', note: 'sick, doctor visit' },
    ]);
  });

  it('limits a note to 200 characters', () => {
    const r = roster([student('a')]);
    expect(setNote(draftsFrom(r), 'a', 'x'.repeat(300)).a?.note).toHaveLength(200);
  });
});

describe('countsOf and flaggedText', () => {
  it('counts what is on screen, with the blanks as unmarked', () => {
    const r = roster([student('a'), student('b'), student('c'), student('d'), student('e')]);
    let d = draftsFrom(r);
    d = setStatus(d, 'a', 'PRESENT');
    d = setStatus(d, 'b', 'ABSENT');
    d = setStatus(d, 'c', 'LATE');
    d = setStatus(d, 'd', 'ON_LEAVE');
    const c = countsOf(r, d);
    expect(c).toEqual({ present: 1, absent: 1, late: 1, onLeave: 1, unmarked: 1, total: 5 });
    expect(flaggedText(c)).toBe('1 absent, 1 late, 1 on leave');
    expect(flaggedText({ ...c, absent: 0, late: 0, onLeave: 0 })).toBe('');
  });
});

describe('registerState', () => {
  it('is not marked, partly marked or marked', () => {
    expect(registerState(undefined)).toBe('not-marked');
    expect(registerState({ enrolled: 10, marked: 0 })).toBe('not-marked');
    expect(registerState({ enrolled: 10, marked: 4 })).toBe('partial');
    expect(registerState({ enrolled: 10, marked: 10 })).toBe('marked');
  });
});

describe('days a teacher may change', () => {
  it('offers today and the seven days before it, newest first', () => {
    const days = editableDays('2026-11-14');
    expect(days).toHaveLength(8);
    expect(days[0]).toBe('2026-11-14');
    expect(days[7]).toBe('2026-11-07');
  });

  it('allows 7 days back and no further, and never the future', () => {
    expect(isEditableDay('2026-11-07', '2026-11-14')).toBe(true);
    expect(isEditableDay('2026-11-06', '2026-11-14')).toBe(false);
    expect(isEditableDay('2026-11-15', '2026-11-14')).toBe(false);
  });

  it('labels the chips', () => {
    expect(dayChipLabel('2026-11-14', '2026-11-14')).toBe('Today');
    expect(dayChipLabel('2026-11-13', '2026-11-14')).toBe('Yesterday');
    expect(dayChipLabel('2026-11-10', '2026-11-14')).toBe('Tue 10 Nov');
  });

  it('reads a date from the address, or falls back to today', () => {
    expect(dateParam('2026-11-12', '2026-11-14')).toBe('2026-11-12');
    expect(dateParam(['2026-11-12'], '2026-11-14')).toBe('2026-11-12');
    expect(dateParam('2026-11-20', '2026-11-14')).toBe('2026-11-14');
    expect(dateParam('2026-02-30', '2026-11-14')).toBe('2026-11-14');
    expect(dateParam('soon', '2026-11-14')).toBe('2026-11-14');
    expect(dateParam(undefined, '2026-11-14')).toBe('2026-11-14');
  });
});

describe('report', () => {
  const row = (id: string, p: number, a: number, l: number, lv: number): ReportStudent => {
    const attended = p + l;
    const counted = attended + a;
    return {
      studentId: id,
      admissionNo: id,
      name: `Student ${id}`,
      rollNo: null,
      present: p,
      absent: a,
      late: l,
      onLeave: lv,
      countedDays: counted,
      attendedDays: attended,
      markedDays: counted + lv,
      percent: counted === 0 ? null : Math.round((attended * 1000) / counted) / 10,
      days: {},
    };
  };

  it('chooses the dates to ask for', () => {
    expect(reportQuery('week', '2026-11-14')).toEqual({ from: '2026-11-08', to: '2026-11-14' });
    expect(reportQuery('month', '2026-11-14')).toEqual({ from: '2026-11-01', to: '2026-11-14' });
    expect(reportQuery('lastMonth', '2026-11-14')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(reportQuery('lastMonth', '2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(reportQuery('year', '2026-11-14')).toEqual({ to: '2026-11-14' });
  });

  it('adds up the division and counts the children under 75%', () => {
    const students = [row('a', 9, 1, 0, 0), row('b', 5, 5, 0, 0), row('c', 0, 0, 0, 3)];
    const s = reportSummary({ students, daysMarked: 10 });
    expect(s).toEqual({ students: 3, daysMarked: 10, percent: 70, low: 1 });
  });

  it('lists the lowest first, children with nothing counted last', () => {
    const students = [row('a', 9, 1, 0, 0), row('c', 0, 0, 0, 3), row('b', 5, 5, 0, 0)];
    expect(lowestFirst(students).map((s) => s.studentId)).toEqual(['b', 'a', 'c']);
  });
});
