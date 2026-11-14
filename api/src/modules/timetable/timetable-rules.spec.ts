import { describe, expect, it } from 'vitest';
import {
  checkGenerateInput,
  generateSlots,
  mondayOf,
  overlaps,
  rankCandidates,
  validateSlots,
  weekDates,
  weekdayOf,
} from './timetable-rules.js';

const WEEK = [1, 2, 3, 4, 5];

describe('generateSlots', () => {
  it('builds periods, gaps and breaks from a few numbers', () => {
    const slots = generateSlots({
      firstStart: '08:30',
      periodMinutes: 40,
      periodsPerDay: 4,
      gapMinutes: 5,
      breaks: [{ afterPeriod: 2, label: 'Recess', minutes: 20 }],
      days: WEEK,
    });
    expect(slots.map((s) => [s.kind, s.label, s.startsAt, s.endsAt])).toEqual([
      ['PERIOD', 'Period 1', '08:30', '09:10'],
      ['PERIOD', 'Period 2', '09:15', '09:55'],
      ['BREAK', 'Recess', '09:55', '10:15'],
      ['PERIOD', 'Period 3', '10:15', '10:55'],
      ['PERIOD', 'Period 4', '11:00', '11:40'],
    ]);
    expect(slots.every((s) => s.days.join() === '1,2,3,4,5')).toBe(true);
  });

  it('puts an assembly first when asked', () => {
    const slots = generateSlots({
      firstStart: '08:00',
      periodMinutes: 30,
      periodsPerDay: 1,
      gapMinutes: 0,
      assemblyMinutes: 15,
      breaks: [],
      days: [6],
    });
    expect(slots.map((s) => [s.kind, s.startsAt, s.endsAt])).toEqual([
      ['ASSEMBLY', '08:00', '08:15'],
      ['PERIOD', '08:15', '08:45'],
    ]);
    expect(validateSlots(slots)).toEqual([]);
  });

  it('refuses impossible input', () => {
    expect(
      checkGenerateInput({
        firstStart: '8:30',
        periodMinutes: 2,
        periodsPerDay: 20,
        gapMinutes: 0,
        breaks: [{ afterPeriod: 25, label: 'x', minutes: 10 }],
        days: [7],
      }).length,
    ).toBeGreaterThanOrEqual(4);
    expect(() =>
      generateSlots({
        firstStart: '23:00',
        periodMinutes: 60,
        periodsPerDay: 3,
        gapMinutes: 0,
        breaks: [],
        days: WEEK,
      }),
    ).toThrow(/midnight/);
  });
});

describe('validateSlots', () => {
  const p = (label: string, startsAt: string, endsAt: string, days = WEEK) => ({
    kind: 'PERIOD' as const,
    label,
    startsAt,
    endsAt,
    days,
  });

  it('accepts a normal day and a separate Saturday', () => {
    expect(
      validateSlots([
        p('Period 1', '08:30', '09:10'),
        p('Period 2', '09:10', '09:50'),
        p('Sat 1', '08:30', '09:00', [6]),
      ]),
    ).toEqual([]);
  });

  it('finds overlaps only on days both rows run', () => {
    expect(
      validateSlots([
        p('Period 1', '08:30', '09:10', [1]),
        p('Period 2', '09:00', '09:40', [2]),
      ]),
    ).toEqual([]);
    expect(
      validateSlots([
        p('Period 1', '08:30', '09:10'),
        p('Period 2', '09:00', '09:40'),
      ])[0],
    ).toMatch(/overlap on Monday/);
  });

  it('refuses bad times, empty names and Sundays', () => {
    expect(validateSlots([p('', '09:00', '08:00')])).toEqual(
      expect.arrayContaining([expect.stringMatching(/needs a name/)]),
    );
    expect(validateSlots([p('A', '09:00', '08:00')])[0]).toMatch(/end after/);
    expect(validateSlots([p('A', '9:00', '10:00')])[0]).toMatch(/HH:mm/);
    expect(validateSlots([p('A', '09:00', '10:00', [7])])[0]).toMatch(
      /Monday to Saturday/,
    );
    expect(validateSlots([])[0]).toMatch(/at least one/);
  });
});

describe('overlaps', () => {
  it('treats touching times as free', () => {
    const a = { startsAt: '09:00', endsAt: '09:40' };
    expect(overlaps(a, { startsAt: '09:40', endsAt: '10:20' })).toBe(false);
    expect(overlaps(a, { startsAt: '09:39', endsAt: '10:20' })).toBe(true);
    expect(overlaps(a, { startsAt: '08:00', endsAt: '12:00' })).toBe(true);
  });
});

describe('week dates', () => {
  it('runs Monday to Saturday', () => {
    // 14 Nov 2026 is a Saturday, 15 Nov a Sunday.
    expect(weekdayOf('2026-11-14')).toBe(6);
    expect(weekdayOf('2026-11-15')).toBe(7);
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(weekDates('2026-11-11')).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ]);
  });
});

describe('rankCandidates', () => {
  it('prefers the subject teacher, then the division, then the lightest day', () => {
    const c = (
      name: string,
      teachesSubjectHere: boolean,
      teachesDivision: boolean,
      periodsThatDay: number,
    ) => ({
      staffId: name,
      name,
      teachesSubjectHere,
      teachesDivision,
      periodsThatDay,
    });
    expect(
      rankCandidates([
        c('Zed', false, false, 1),
        c('Amy', false, false, 3),
        c('Bob', false, true, 5),
        c('Cal', true, true, 6),
      ]).map((x) => x.name),
    ).toEqual(['Cal', 'Bob', 'Zed', 'Amy']);
  });
});
