import { monthGrid } from '@/features/attendance/attendanceLogic';
import { canStep, monthRange, recordsFromAnswer, summaryUpTo, upcomingLeave, type StaffAttendanceAnswer } from './staffAttendanceLogic';

const answer = (days: StaffAttendanceAnswer['people'][0]['days'], records: StaffAttendanceAnswer['records'] = []): StaffAttendanceAnswer => ({
  from: '2026-11-01',
  to: '2026-11-30',
  daysMarked: records.length,
  markedDates: records.map((r) => r.date),
  people: [{ staffId: 's', name: 'Farzana Sultana', designation: 'Class Teacher', present: 0, absent: 0, late: 0, onLeave: 0, days }],
  records,
});

describe('monthRange', () => {
  it('asks for the whole month, including a short one and a leap February', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('canStep', () => {
  it('goes back a year at most and never past this month', () => {
    expect(canStep('2026-11', 1, '2026-11-15')).toBe(false);
    expect(canStep('2026-10', 1, '2026-11-15')).toBe(true);
    expect(canStep('2026-11', -1, '2026-11-15')).toBe(true);
    expect(canStep('2025-11', -1, '2026-11-15')).toBe(false);
    expect(canStep('2025-12', -1, '2026-11-15')).toBe(true);
    expect(canStep('2026-01', 1, '2026-01-31')).toBe(false);
  });
});

describe('recordsFromAnswer', () => {
  it('joins the marked days with their notes and puts leave days in as On leave', () => {
    const records = recordsFromAnswer(
      answer(
        { '2026-11-12': 'PRESENT', '2026-11-10': 'LATE', '2026-11-13': 'ON_LEAVE' },
        [
          { date: '2026-11-12', status: 'PRESENT', note: null },
          { date: '2026-11-10', status: 'LATE', note: 'Traffic' },
        ],
      ),
    );
    expect(records).toEqual([
      { date: '2026-11-10', status: 'LATE', note: 'Traffic' },
      { date: '2026-11-12', status: 'PRESENT', note: null },
      { date: '2026-11-13', status: 'ON_LEAVE', note: null },
    ]);
  });

  it('is empty before anything arrives, or for a person with no days', () => {
    expect(recordsFromAnswer(undefined)).toEqual([]);
    expect(recordsFromAnswer(answer({}))).toEqual([]);
    expect(recordsFromAnswer({ ...answer({}), people: [] })).toEqual([]);
  });

  it('feeds the month grid: a letter on each marked day, Sundays and unmarked days left alone', () => {
    const records = recordsFromAnswer(answer({ '2026-11-02': 'PRESENT', '2026-11-03': 'ON_LEAVE', '2026-11-04': 'ABSENT' }));
    const cells = monthGrid('2026-11', records, '2026-11-15').flat();
    expect(cells.find((c) => c.date === '2026-11-02')?.status).toBe('PRESENT');
    expect(cells.find((c) => c.date === '2026-11-03')?.status).toBe('ON_LEAVE');
    expect(cells.find((c) => c.date === '2026-11-05')?.status).toBeNull();
    expect(cells.find((c) => c.date === '2026-11-01')?.isSunday).toBe(true);
    expect(cells.find((c) => c.date === '2026-11-15')?.isToday).toBe(true);
  });
});

describe('summaryUpTo', () => {
  const records = recordsFromAnswer(
    answer({
      '2026-11-02': 'PRESENT',
      '2026-11-03': 'PRESENT',
      '2026-11-04': 'LATE',
      '2026-11-05': 'ABSENT',
      '2026-11-06': 'ON_LEAVE',
      '2026-11-20': 'ON_LEAVE',
    }),
  );

  it('counts attended over counted days, leaving leave out of both sides and days still to come out', () => {
    const s = summaryUpTo(records, '2026-11-15');
    expect(s).toMatchObject({ present: 2, late: 1, absent: 1, onLeave: 1, countedDays: 4, attendedDays: 3, percent: 75 });
  });

  it('has no percentage before any day counts', () => {
    expect(summaryUpTo(records, '2026-11-01').percent).toBeNull();
  });

  it('counts leave booked for later days', () => {
    expect(upcomingLeave(records, '2026-11-15')).toBe(1);
    expect(upcomingLeave(records, '2026-11-30')).toBe(0);
  });
});
