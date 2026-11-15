import { rowStates, upNext } from '@/features/timetable/dayPlan';
import {
  lessonsAway,
  lessonsToTeach,
  nextLessonIn,
  nextLessonText,
  planTeacherDay,
  marksHref,
  registerHref,
  type TeacherCell,
  type TeacherChange,
  type TeacherWeek,
} from './teacherDay';

const ME = { id: 'me', fullName: 'Farzana Sultana' };
const NURSERY = { id: 'div-n', label: 'Nursery-A' };
const JKG = { id: 'div-j', label: 'Junior KG-B' };

const rows = [
  { key: '08:45-09:20', kind: 'PERIOD' as const, label: 'Period 1', startsAt: '08:45', endsAt: '09:20', days: [1, 2, 3] },
  { key: '09:20-09:55', kind: 'PERIOD' as const, label: 'Period 2', startsAt: '09:20', endsAt: '09:55', days: [1, 2, 3] },
  { key: '10:50-11:25', kind: 'PERIOD' as const, label: 'Period 4', startsAt: '10:50', endsAt: '11:25', days: [1, 2, 3] },
];

const cell = (rowKey: string, weekday: number, division = NURSERY, subject = 'English'): TeacherCell => ({
  id: `${rowKey}-${weekday}`,
  rowKey,
  slotId: `slot-${rowKey}`,
  weekday,
  subject: subject ? { id: `s-${subject}`, name: subject } : null,
  staff: ME,
  room: 'Room 1',
  division,
});

const change = (over: Partial<TeacherChange>): TeacherChange => ({
  id: 'c1',
  date: '2026-11-16',
  rowKey: '08:45-09:20',
  slotId: 'slot-1',
  kind: 'CANCELLED',
  division: NURSERY,
  substitute: null,
  subject: null,
  reason: null,
  ...over,
});

const week = (over: Partial<TeacherWeek> = {}): TeacherWeek => ({
  academicYear: { id: 'y', name: '2026-27' },
  today: '2026-11-16',
  weekOf: '2026-11-16',
  days: [
    { date: '2026-11-16', weekday: 1, name: 'Monday', holiday: null },
    { date: '2026-11-17', weekday: 2, name: 'Tuesday', holiday: 'Diwali' },
  ],
  staff: ME,
  rows,
  cells: [cell('08:45-09:20', 1), cell('09:20-09:55', 1, JKG, 'EVS'), cell('10:50-11:25', 2)],
  changes: [],
  periodsPerWeek: 3,
  ...over,
});

describe('planTeacherDay', () => {
  it('lists only the periods the teacher has, in time order, with the class', () => {
    const plan = planTeacherDay(week(), '2026-11-16');
    expect(plan.status).toBe('school');
    expect(plan.rows.map((r) => [r.startsAt, r.divisionLabel, r.subject])).toEqual([
      ['08:45', 'Nursery-A', 'English'],
      ['09:20', 'Junior KG-B', 'EVS'],
    ]);
    expect(lessonsToTeach(plan)).toBe(2);
  });

  it('says there is no school on a Sunday and on a holiday', () => {
    expect(planTeacherDay(week(), '2026-11-15').status).toBe('sunday');
    const holiday = planTeacherDay(week(), '2026-11-17');
    expect(holiday.status).toBe('holiday');
    expect(holiday.holiday).toBe('Diwali');
    expect(holiday.rows).toHaveLength(0);
  });

  it('gives an empty plan for a day with no lesson, or while the week is loading', () => {
    expect(planTeacherDay(week(), '2026-11-18').status).toBe('no-lessons');
    expect(planTeacherDay(null, '2026-11-16').status).toBe('no-lessons');
  });

  it('shows a cancelled lesson struck through and does not count it', () => {
    const plan = planTeacherDay(week({ changes: [change({ kind: 'CANCELLED' })] }), '2026-11-16');
    const first = plan.rows[0]!;
    expect(first.change?.kind).toBe('CANCELLED');
    expect(lessonsToTeach(plan)).toBe(1);
    expect(lessonsAway(plan)).toBe(1);
  });

  it('shows a lesson another teacher takes, and does not offer it as the next one', () => {
    const takenBy = { id: 'other', fullName: 'Ravi Kumar' };
    const plan = planTeacherDay(week({ changes: [change({ kind: 'SUBSTITUTE', substitute: takenBy })] }), '2026-11-16');
    const first = plan.rows[0]!;
    expect(first.coveredByOther).toBe(true);
    expect(first.change?.substitute).toBe('Ravi Kumar');
    expect(lessonsToTeach(plan)).toBe(1);
    // At 8:00 the next lesson is the 9:20 one, not the one Ravi is taking.
    expect(upNext(plan.rows, '2026-11-16', '2026-11-16', 8 * 60)?.row.startsAt).toBe('09:20');
  });

  it('adds a period the teacher covers for someone else, marked Covering', () => {
    const cover = change({
      id: 'c2',
      rowKey: '10:50-11:25',
      date: '2026-11-16',
      kind: 'SUBSTITUTE',
      division: JKG,
      substitute: ME,
      subject: { id: 's-maths', name: 'Maths' },
    });
    const plan = planTeacherDay(week({ changes: [cover] }), '2026-11-16');
    const covering = plan.rows.find((r) => r.covering);
    expect(covering).toMatchObject({ startsAt: '10:50', divisionLabel: 'Junior KG-B', subject: 'Maths' });
    expect(lessonsToTeach(plan)).toBe(3);
  });

  it('ignores changes on other days', () => {
    const plan = planTeacherDay(week({ changes: [change({ date: '2026-11-23' })] }), '2026-11-16');
    expect(plan.rows.every((r) => r.change === null)).toBe(true);
  });

  it('marks the live state of the day', () => {
    const plan = planTeacherDay(week(), '2026-11-16');
    expect(rowStates(plan.rows, '2026-11-16', '2026-11-16', 9 * 60)).toEqual(['now', 'next']);
  });
});

describe('registerHref and nextLessonText', () => {
  it('opens that division\'s register for that day', () => {
    const plan = planTeacherDay(week(), '2026-11-16');
    expect(registerHref(plan.rows[0]!, '2026-11-16')).toBe('/teacher/attendance/div-n?date=2026-11-16');
    expect(registerHref({ divisionId: undefined }, '2026-11-16')).toBeNull();
  });

  it('opens the list of tests for that division from the Marks button', () => {
    const plan = planTeacherDay(week(), '2026-11-16');
    expect(marksHref(plan.rows[0]!)).toBe('/teacher/marks?divisionId=div-n');
    expect(marksHref({ divisionId: undefined })).toBe('/teacher/marks');
  });

  it('writes the line under the Lessons tile', () => {
    const plan = planTeacherDay(week(), '2026-11-16');
    const clock = (t: string) => t;
    expect(nextLessonText(upNext(plan.rows, '2026-11-16', '2026-11-16', 8 * 60), clock)).toBe('Next: Nursery-A, 08:45');
    expect(nextLessonText(upNext(plan.rows, '2026-11-16', '2026-11-16', 9 * 60), clock)).toBe('Now: Nursery-A');
    expect(nextLessonText(null, clock)).toBeNull();
  });
});

describe('nextLessonIn', () => {
  it('finds the next lesson in a class later today', () => {
    const next = nextLessonIn(week(), 'div-j', '2026-11-16', 8 * 60);
    expect(next?.date).toBe('2026-11-16');
    expect(next?.row.startsAt).toBe('09:20');
  });

  it('moves on to a later day once today\'s lessons in that class are over', () => {
    const w = week({ days: [
      { date: '2026-11-16', weekday: 1, name: 'Monday', holiday: null },
      { date: '2026-11-17', weekday: 2, name: 'Tuesday', holiday: null },
    ] });
    // Nursery-A: Monday 08:45 (over by 10:00) and Tuesday 10:50.
    const next = nextLessonIn(w, 'div-n', '2026-11-16', 10 * 60);
    expect(next?.date).toBe('2026-11-17');
    expect(next?.row.startsAt).toBe('10:50');
  });

  it('skips a cancelled lesson, and gives null when nothing is left this week', () => {
    const cancelled = week({ changes: [change({ kind: 'CANCELLED', rowKey: '08:45-09:20' })] });
    expect(nextLessonIn(cancelled, 'div-n', '2026-11-16', 7 * 60)).toBeNull();
    expect(nextLessonIn(week(), 'div-n', '2026-11-16', 12 * 60)).toBeNull();
    expect(nextLessonIn(null, 'div-n', '2026-11-16', 0)).toBeNull();
  });
});
