import {
  addDays,
  daysBetween,
  isIsoDate,
  summarise,
  tally,
  todayInIndia,
} from './attendance-rules.js';

describe('attendance rules', () => {
  it('accepts real dates only', () => {
    expect(isIsoDate('2026-11-08')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('8-11-2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-01', '2026-11-08')).toBe(7);
  });

  it('works out today in India, not in UTC', () => {
    // 20:00 UTC on the 7th is already 01:30 on the 8th in India.
    expect(todayInIndia(new Date('2026-11-07T20:00:00Z'))).toBe('2026-11-08');
    expect(todayInIndia(new Date('2026-11-07T10:00:00Z'))).toBe('2026-11-07');
  });

  it('counts present and late as attended and leaves approved leave out', () => {
    const s = summarise(
      tally([
        ...Array<'PRESENT'>(16).fill('PRESENT'),
        ...Array<'LATE'>(2).fill('LATE'),
        ...Array<'ABSENT'>(2).fill('ABSENT'),
        ...Array<'ON_LEAVE'>(3).fill('ON_LEAVE'),
      ]),
    );
    expect(s.attendedDays).toBe(18);
    expect(s.countedDays).toBe(20);
    expect(s.markedDays).toBe(23);
    expect(s.percent).toBe(90);
  });

  it('rounds to one decimal and has no percentage before anything counts', () => {
    expect(
      summarise({ present: 2, absent: 1, late: 0, onLeave: 0 }).percent,
    ).toBe(66.7);
    expect(
      summarise({ present: 0, absent: 0, late: 0, onLeave: 4 }).percent,
    ).toBeNull();
    expect(
      summarise({ present: 0, absent: 0, late: 0, onLeave: 0 }).percent,
    ).toBeNull();
  });
});
