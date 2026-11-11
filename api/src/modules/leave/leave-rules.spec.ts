import {
  balanceOf,
  entitledHalfDays,
  leaveDates,
  leaveSize,
  overlaps,
  toDays,
  toHalfDays,
} from './leave-rules.js';

describe('leaveDates', () => {
  it('leaves out Sundays', () => {
    // 2026-11-09 is a Monday.
    expect(leaveDates('2026-11-09', '2026-11-15')).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ]);
  });
});

describe('leaveSize', () => {
  it('counts working days in half days', () => {
    expect(leaveSize('2026-11-09', '2026-11-09', false)).toEqual({
      ok: true,
      halfDays: 2,
    });
    expect(leaveSize('2026-11-09', '2026-11-14', false)).toEqual({
      ok: true,
      halfDays: 12,
    });
    // Over a Sunday: Saturday to Monday is 2 working days.
    expect(leaveSize('2026-11-14', '2026-11-16', false)).toEqual({
      ok: true,
      halfDays: 4,
    });
  });
  it('allows a half day only on one working day', () => {
    expect(leaveSize('2026-11-09', '2026-11-09', true)).toEqual({
      ok: true,
      halfDays: 1,
    });
    expect(leaveSize('2026-11-09', '2026-11-10', true)).toMatchObject({
      ok: false,
    });
    expect(leaveSize('2026-11-15', '2026-11-15', true)).toMatchObject({
      ok: false,
    });
  });
  it('refuses a Sunday, a backwards range and an enormous one', () => {
    expect(leaveSize('2026-11-15', '2026-11-15', false)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/Sunday/),
    });
    expect(leaveSize('2026-11-10', '2026-11-09', false)).toMatchObject({
      ok: false,
    });
    expect(leaveSize('2026-01-01', '2026-12-31', false)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/at most/),
    });
  });
});

describe('entitledHalfDays', () => {
  const rows = [
    { leaveTypeId: 'casual', staffTypeId: null, halfDays: 24 },
    { leaveTypeId: 'casual', staffTypeId: 'teacher', halfDays: 30 },
    { leaveTypeId: 'sick', staffTypeId: null, halfDays: 20 },
  ];
  it('uses the staff type row first, then the general one, then nothing', () => {
    expect(entitledHalfDays(rows, 'casual', 'teacher')).toBe(30);
    expect(entitledHalfDays(rows, 'casual', 'clerk')).toBe(24);
    expect(entitledHalfDays(rows, 'casual', null)).toBe(24);
    expect(entitledHalfDays(rows, 'sick', 'teacher')).toBe(20);
    expect(entitledHalfDays(rows, 'earned', 'teacher')).toBe(0);
  });
});

describe('balanceOf', () => {
  it('splits taken, upcoming and pending, and shows what is left', () => {
    const b = balanceOf(
      24,
      [
        { status: 'APPROVED', endsOn: '2026-11-01', halfDays: 4 },
        { status: 'APPROVED', endsOn: '2026-11-20', halfDays: 6 },
        { status: 'PENDING', endsOn: '2026-12-01', halfDays: 2 },
      ],
      '2026-11-10',
    );
    expect(b).toEqual({
      entitled: 24,
      taken: 4,
      upcoming: 6,
      pending: 2,
      remaining: 12,
    });
  });
  it('a request ending today is still upcoming, and the balance never goes below zero', () => {
    expect(
      balanceOf(
        2,
        [{ status: 'APPROVED', endsOn: '2026-11-10', halfDays: 4 }],
        '2026-11-10',
      ),
    ).toMatchObject({
      upcoming: 4,
      remaining: 0,
    });
  });
});

describe('small helpers', () => {
  it('detects overlapping ranges', () => {
    expect(
      overlaps('2026-11-01', '2026-11-05', '2026-11-05', '2026-11-09'),
    ).toBe(true);
    expect(
      overlaps('2026-11-01', '2026-11-04', '2026-11-05', '2026-11-09'),
    ).toBe(false);
  });
  it('converts between days and half days', () => {
    expect(toDays(3)).toBe(1.5);
    expect(toHalfDays(12)).toBe(24);
    expect(toHalfDays(0.5)).toBe(1);
    expect(toHalfDays(0.3)).toBeNull();
    expect(toHalfDays(-1)).toBeNull();
  });
});
