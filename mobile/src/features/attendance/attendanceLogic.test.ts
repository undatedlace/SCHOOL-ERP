import {
  isLow,
  lastOfMonth,
  monthGrid,
  notPresent,
  rangeDays,
  recordsIn,
  shiftMonth,
  summarise,
  tally,
  type AttendanceRecord,
} from './attendanceLogic';

const rec = (date: string, status: AttendanceRecord['status'], note: string | null = null): AttendanceRecord => ({ date, status, note });

describe('summarise', () => {
  it('counts present and late as attended, leaves approved leave out of both sides', () => {
    const records = [
      ...Array.from({ length: 17 }, (_, i) => rec(`2026-10-${String(i + 1).padStart(2, '0')}`, 'PRESENT')),
      rec('2026-10-18', 'LATE'),
      rec('2026-10-19', 'ABSENT'),
      rec('2026-10-20', 'ABSENT'),
      rec('2026-10-21', 'ON_LEAVE'),
    ];
    const s = summarise(tally(records));
    expect(s).toMatchObject({ present: 17, late: 1, absent: 2, onLeave: 1, attendedDays: 18, countedDays: 20, markedDays: 21 });
    expect(s.percent).toBe(90);
  });

  it('is null with nothing counted, and rounds to one decimal', () => {
    expect(summarise(tally([rec('2026-10-01', 'ON_LEAVE')])).percent).toBeNull();
    expect(summarise({ present: 2, late: 0, absent: 1, onLeave: 0 }).percent).toBe(66.7);
  });

  it('calls under 75 low and 75 not low', () => {
    expect(isLow(74.9)).toBe(true);
    expect(isLow(75)).toBe(false);
    expect(isLow(null)).toBe(false);
  });
});

describe('months and ranges', () => {
  it('shifts across year ends and finds the last day', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(lastOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastOfMonth('2028-02')).toBe('2028-02-29');
  });

  it('works out the three ranges', () => {
    expect(rangeDays('year', '2026-11-14', '2026-04-01')).toEqual({ from: '2026-04-01', to: '2026-11-14' });
    expect(rangeDays('thisMonth', '2026-11-14', '2026-04-01')).toEqual({ from: '2026-11-01', to: '2026-11-14' });
    expect(rangeDays('lastMonth', '2026-11-14', '2026-04-01')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(rangeDays('lastMonth', '2027-01-05', '2026-04-01')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('keeps only records inside a range', () => {
    const all = [rec('2026-10-31', 'ABSENT'), rec('2026-11-01', 'PRESENT'), rec('2026-11-10', 'LATE')];
    expect(recordsIn(all, '2026-11-01', '2026-11-30').map((r) => r.date)).toEqual(['2026-11-01', '2026-11-10']);
  });
});

describe('monthGrid', () => {
  // November 2026 starts on a Sunday and has 30 days.
  const grid = monthGrid('2026-11', [rec('2026-11-02', 'ABSENT'), rec('2026-11-03', 'LATE'), rec('2026-11-04', 'ON_LEAVE')], '2026-11-14');

  it('starts weeks on Monday with blanks before the 1st', () => {
    expect(grid[0]!.slice(0, 6).every((c) => c.date === null)).toBe(true);
    expect(grid[0]![6]).toMatchObject({ date: '2026-11-01', day: 1, isSunday: true });
    expect(grid.every((row) => row.length === 7)).toBe(true);
    expect(grid.flat().filter((c) => c.date).length).toBe(30);
  });

  it('puts each mark on its day and flags today and the future', () => {
    const cells = grid.flat();
    expect(cells.find((c) => c.date === '2026-11-02')?.status).toBe('ABSENT');
    expect(cells.find((c) => c.date === '2026-11-03')?.status).toBe('LATE');
    expect(cells.find((c) => c.date === '2026-11-04')?.status).toBe('ON_LEAVE');
    expect(cells.find((c) => c.date === '2026-11-05')?.status).toBeNull();
    expect(cells.find((c) => c.date === '2026-11-14')?.isToday).toBe(true);
    expect(cells.find((c) => c.date === '2026-11-15')?.isFuture).toBe(true);
  });
});

describe('notPresent', () => {
  it('lists non-present days newest first', () => {
    const list = notPresent([rec('2026-10-01', 'ABSENT'), rec('2026-10-02', 'PRESENT'), rec('2026-10-09', 'LATE'), rec('2026-10-05', 'ON_LEAVE')]);
    expect(list.map((r) => r.date)).toEqual(['2026-10-09', '2026-10-05', '2026-10-01']);
  });
});
