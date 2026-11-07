import { dateOnly, todayIso } from './dates.js';

describe('school dates', () => {
  it('uses the calendar day in India, not UTC', () => {
    // 20:00 UTC on 7 Nov is 01:30 on 8 Nov in India.
    expect(todayIso(new Date('2026-11-07T20:00:00Z'))).toBe('2026-11-08');
    expect(todayIso(new Date('2026-11-07T10:00:00Z'))).toBe('2026-11-07');
  });

  it('turns a date string into a date-only value', () => {
    expect(dateOnly('2026-04-01').toISOString()).toBe(
      '2026-04-01T00:00:00.000Z',
    );
  });
});
