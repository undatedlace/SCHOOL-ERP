import { isoWeekday, minutesText, nowLine, planDay, rowStates, schoolIsOver, upNext } from './dayPlan';
import type { DivisionWeek } from './types';

const person = (id: string, fullName: string) => ({ id, fullName });
const subject = (id: string, name: string) => ({ id, name });

// Monday 9 Nov to Saturday 14 Nov 2026. Saturday has no rows.
const days = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'].map((date, i) => ({
  date,
  weekday: i + 1,
  name: '',
  holiday: date === '2026-11-11' ? 'Diwali' : null,
}));

const week: DivisionWeek = {
  today: '2026-11-10',
  weekOf: '2026-11-09',
  days,
  division: { id: 'd1', label: 'Nursery-A' },
  schedule: { id: 's1', name: 'Pre-primary' },
  classTeacher: null,
  rows: [
    { key: 'asm', kind: 'ASSEMBLY', label: 'Assembly', startsAt: '08:30', endsAt: '08:45', days: [1, 2, 3, 4, 5] },
    { key: 'p1', kind: 'PERIOD', label: 'Period 1', startsAt: '08:45', endsAt: '09:20', days: [1, 2, 3, 4, 5] },
    { key: 'p2', kind: 'PERIOD', label: 'Period 2', startsAt: '09:20', endsAt: '09:55', days: [1, 2, 3, 4, 5] },
    { key: 'brk', kind: 'BREAK', label: 'Snack break', startsAt: '10:30', endsAt: '10:50', days: [1, 2, 3, 4, 5] },
    { key: 'p3', kind: 'PERIOD', label: 'Period 3', startsAt: '10:50', endsAt: '11:25', days: [1, 2, 3, 4, 5] },
    { key: 'p4', kind: 'PERIOD', label: 'Period 4', startsAt: '11:25', endsAt: '12:00', days: [1, 2, 3, 4, 5] },
  ],
  cells: [
    { id: 'c1', rowKey: 'p1', weekday: 2, subject: subject('s1', 'English'), staff: person('t1', 'Farzana'), room: 'Room 1' },
    { id: 'c2', rowKey: 'p2', weekday: 2, subject: subject('s2', 'Maths'), staff: person('t2', 'Imran'), room: 'Room 1' },
    { id: 'c3', rowKey: 'p3', weekday: 2, subject: subject('s3', 'Art'), staff: person('t3', 'Zoya'), room: null },
    // Period 4 on Tuesday has nothing: a free period.
  ],
  changes: [
    { id: 'x1', date: '2026-11-10', rowKey: 'p2', kind: 'SUBSTITUTE', substitute: person('t9', 'Meera'), subject: null },
    { id: 'x2', date: '2026-11-10', rowKey: 'p3', kind: 'CANCELLED', substitute: null, subject: null },
  ],
};

const TUE = '2026-11-10';
const at = (h: number, m = 0) => h * 60 + m;

describe('planDay', () => {
  it('lists the rows of the weekday in time order with subject, teacher and room', () => {
    const plan = planDay(week, TUE);
    expect(plan.status).toBe('school');
    expect(plan.rows.map((r) => r.label)).toEqual(['Assembly', 'Period 1', 'Period 2', 'Snack break', 'Period 3', 'Period 4']);
    expect(plan.rows[1]).toMatchObject({ subject: 'English', teacher: 'Farzana', room: 'Room 1', free: false, change: null });
  });

  it('names the substitute and keeps the subject of a substituted period', () => {
    const p2 = planDay(week, TUE).rows[2]!;
    expect(p2.teacher).toBe('Meera');
    expect(p2.subject).toBe('Maths');
    expect(p2.change).toEqual({ kind: 'SUBSTITUTE', substitute: 'Meera' });
  });

  it('marks a cancelled period and keeps its subject for the strike-through', () => {
    const p3 = planDay(week, TUE).rows[4]!;
    expect(p3.change?.kind).toBe('CANCELLED');
    expect(p3.subject).toBe('Art');
    expect(p3.free).toBe(false);
  });

  it('marks an empty period box as free', () => {
    expect(planDay(week, TUE).rows[5]!.free).toBe(true);
  });

  it('says holiday, Sunday and no lessons without rows', () => {
    expect(planDay(week, '2026-11-11')).toMatchObject({ status: 'holiday', holiday: 'Diwali', rows: [] });
    expect(planDay(week, '2026-11-15').status).toBe('sunday');
    expect(planDay(week, '2026-11-14').status).toBe('no-lessons');
    expect(planDay(null, TUE).status).toBe('no-lessons');
  });

  it('numbers weekdays 1 (Monday) to 7 (Sunday)', () => {
    expect(isoWeekday('2026-11-09')).toBe(1);
    expect(isoWeekday('2026-11-15')).toBe(7);
  });
});

describe('rowStates', () => {
  const rows = planDay(week, TUE).rows;

  it('is done before now, now inside, and the first lesson to come is next', () => {
    // 09:30: assembly and period 1 done, period 2 now, then break (later), period 3 cancelled (later), period 4 free (later).
    expect(rowStates(rows, TUE, TUE, at(9, 30))).toEqual(['done', 'done', 'now', 'later', 'later', 'later']);
  });

  it('skips breaks, cancelled and free periods when choosing next', () => {
    // 08:00: assembly is first but not a lesson, period 1 is next.
    expect(rowStates(rows, TUE, TUE, at(8, 0))).toEqual(['later', 'next', 'later', 'later', 'later', 'later']);
  });

  it('treats earlier days as done and later days as later', () => {
    expect(rowStates(rows, '2026-11-09', TUE, at(9, 0)).every((s) => s === 'done')).toBe(true);
    expect(rowStates(rows, '2026-11-12', TUE, at(9, 0)).every((s) => s === 'later')).toBe(true);
  });

  it('is done at the exact end minute', () => {
    expect(rowStates(rows, TUE, TUE, at(9, 20))[1]).toBe('done');
    expect(rowStates(rows, TUE, TUE, at(9, 20))[2]).toBe('now');
  });
});

describe('nowLine', () => {
  const rows = planDay(week, TUE).rows;

  it('sits inside the row the clock is in, as a fraction of it', () => {
    const line = nowLine(rows, TUE, TUE, at(9, 37))!; // 17 of 35 minutes into period 2
    expect(line.index).toBe(2);
    expect(line.inside).toBe(true);
    expect(line.fraction).toBeCloseTo(17 / 35, 5);
  });

  it('sits between rows in a gap (09:55 to 10:30 has no row)', () => {
    expect(nowLine(rows, TUE, TUE, at(10, 10))).toEqual({ index: 3, inside: false, fraction: 0 });
  });

  it('is absent before school, after school and on other days', () => {
    expect(nowLine(rows, TUE, TUE, at(7, 0))).toBeNull();
    expect(nowLine(rows, TUE, TUE, at(13, 0))).toBeNull();
    expect(nowLine(rows, '2026-11-09', TUE, at(9, 0))).toBeNull();
    expect(nowLine([], TUE, TUE, at(9, 0))).toBeNull();
  });
});

describe('upNext', () => {
  const rows = planDay(week, TUE).rows;

  it('is the running lesson with minutes left', () => {
    const n = upNext(rows, TUE, TUE, at(9, 0))!;
    expect(n.when).toBe('now');
    expect(n.row.label).toBe('Period 1');
    expect(n.minutes).toBe(20);
  });

  it('is the next lesson with minutes until it starts, skipping a break', () => {
    // 09:56: period 2 has ended; period 3 is cancelled and period 4 is free, so nothing is left.
    expect(upNext(rows, TUE, TUE, at(9, 56))).toBeNull();
    const before = upNext(rows, TUE, TUE, at(8, 0))!;
    expect(before).toMatchObject({ when: 'next', minutes: 45 });
    expect(before.row.label).toBe('Period 1');
  });

  it('is null on another day', () => {
    expect(upNext(rows, '2026-11-12', TUE, at(9, 0))).toBeNull();
  });
});

describe('schoolIsOver and minutesText', () => {
  const rows = planDay(week, TUE).rows;
  it('is over once the last row has ended, only today', () => {
    expect(schoolIsOver(rows, TUE, TUE, at(12, 0))).toBe(true);
    expect(schoolIsOver(rows, TUE, TUE, at(11, 59))).toBe(false);
    expect(schoolIsOver(rows, '2026-11-12', TUE, at(15, 0))).toBe(false);
  });
  it('words minutes', () => {
    expect(minutesText(0)).toBe('less than a minute');
    expect(minutesText(12)).toBe('12 min');
    expect(minutesText(60)).toBe('1 h');
    expect(minutesText(65)).toBe('1 h 5 min');
  });
});
