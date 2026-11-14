import {
  MAX_DAYS_AHEAD,
  countDays,
  covers,
  overlaps,
  windowProblem,
} from './student-leave-rules.js';

// 2026-11-09 is a Monday; 2026-11-15 is a Sunday.
describe('countDays', () => {
  it('counts Monday to Saturday and skips the Sunday', () => {
    const c = countDays('2026-11-09', '2026-11-16', false);
    expect(c.days).toBe(7);
    expect(c.skipped).toEqual([{ date: '2026-11-15', reason: 'SUNDAY' }]);
    expect(c.dates).toHaveLength(7);
  });

  it('skips school holidays and says why', () => {
    const c = countDays(
      '2026-11-09',
      '2026-11-11',
      false,
      new Set(['2026-11-10']),
    );
    expect(c.days).toBe(2);
    expect(c.skipped).toEqual([{ date: '2026-11-10', reason: 'HOLIDAY' }]);
  });

  it('calls a holiday that falls on a Sunday a Sunday', () => {
    const c = countDays(
      '2026-11-15',
      '2026-11-15',
      false,
      new Set(['2026-11-15']),
    );
    expect(c.skipped).toEqual([{ date: '2026-11-15', reason: 'SUNDAY' }]);
  });

  it('counts a half day as 0.5, and a half day on a Sunday as nothing', () => {
    expect(countDays('2026-11-09', '2026-11-09', true).days).toBe(0.5);
    expect(countDays('2026-11-15', '2026-11-15', true).days).toBe(0);
  });

  it('counts nothing when every day is skipped', () => {
    const c = countDays(
      '2026-11-14',
      '2026-11-15',
      false,
      new Set(['2026-11-14']),
    );
    expect(c.days).toBe(0);
    expect(c.dates).toEqual([]);
  });
});

describe('windowProblem', () => {
  const today = '2026-11-14';
  it('allows today and up to 60 days ahead', () => {
    expect(windowProblem(today, today, false, today)).toBeNull();
    expect(windowProblem('2027-01-13', '2027-01-13', false, today)).toBeNull();
    expect(MAX_DAYS_AHEAD).toBe(60);
  });
  it('refuses the past, too far ahead, backwards ranges and multi-day half days', () => {
    expect(windowProblem('2026-11-13', '2026-11-14', false, today)).toMatch(
      /past/,
    );
    expect(windowProblem('2027-01-14', '2027-01-14', false, today)).toMatch(
      /60 days/,
    );
    expect(windowProblem('2026-11-16', '2026-11-15', false, today)).toMatch(
      /before/,
    );
    expect(windowProblem('2026-11-16', '2026-11-17', true, today)).toMatch(
      /single day/,
    );
  });
});

describe('overlaps and covers', () => {
  it('shares a day when the ranges touch', () => {
    expect(
      overlaps('2026-11-09', '2026-11-11', '2026-11-11', '2026-11-12'),
    ).toBe(true);
    expect(
      overlaps('2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'),
    ).toBe(false);
  });
  it('covers its first and last day', () => {
    expect(covers('2026-11-09', '2026-11-11', '2026-11-09')).toBe(true);
    expect(covers('2026-11-09', '2026-11-11', '2026-11-11')).toBe(true);
    expect(covers('2026-11-09', '2026-11-11', '2026-11-12')).toBe(false);
  });
});
