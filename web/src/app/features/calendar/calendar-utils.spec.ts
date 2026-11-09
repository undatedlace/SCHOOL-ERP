import { CalendarEvent } from '../../core/models';
import {
  dateRangeText,
  eventsOn,
  gridRange,
  monthGrid,
  shiftMonth,
  timeRangeText,
  timeText,
} from './calendar-utils';

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'x',
  title: 'T',
  description: null,
  category: 'EVENT',
  startsOn: '2026-12-05',
  endsOn: '2026-12-05',
  startTime: null,
  endTime: null,
  audience: 'ALL',
  classes: [],
  divisions: [],
  announced: false,
  canChange: false,
  ...over,
});

describe('monthGrid', () => {
  it('starts on the Sunday on or before the 1st and covers whole weeks', () => {
    // 1 Nov 2026 is a Sunday.
    const nov = monthGrid(2026, 10);
    expect(nov[0][0]).toEqual({ iso: '2026-11-01', day: 1, inMonth: true });
    expect(nov.every((w) => w.length === 7)).toBe(true);
    expect(nov.length).toBe(5);
    // 1 Dec 2026 is a Tuesday: the grid starts on 29 Nov.
    const dec = monthGrid(2026, 11);
    expect(dec[0][0]).toEqual({ iso: '2026-11-29', day: 29, inMonth: false });
    expect(dec[0][2].iso).toBe('2026-12-01');
  });
  it('shows a sixth week only when the month needs it', () => {
    // 1 Aug 2026 is a Saturday: 31 days spill into a sixth week.
    expect(monthGrid(2026, 7).length).toBe(6);
  });
  it('gives the range of the grid', () => {
    expect(gridRange(2026, 11)).toEqual({ from: '2026-11-29', to: '2027-01-02' });
  });
});

describe('eventsOn', () => {
  it('includes multi-day events on each day, ordered by time then title', () => {
    const list = [
      ev({ id: 'a', title: 'B', startTime: '10:00' }),
      ev({ id: 'b', title: 'A', startTime: '09:00' }),
      ev({ id: 'c', title: 'Trip', startsOn: '2026-12-04', endsOn: '2026-12-06' }),
      ev({ id: 'd', startsOn: '2026-12-07', endsOn: '2026-12-07' }),
    ];
    expect(eventsOn(list, '2026-12-05').map((e) => e.id)).toEqual(['c', 'b', 'a']);
    expect(eventsOn(list, '2026-12-06').map((e) => e.id)).toEqual(['c']);
    expect(eventsOn(list, '2026-12-08')).toEqual([]);
  });
});

describe('text helpers', () => {
  it('writes times in 12 hours', () => {
    expect(timeText('00:05')).toBe('12:05 am');
    expect(timeText('12:00')).toBe('12:00 pm');
    expect(timeText('15:30')).toBe('3:30 pm');
    expect(timeText(null)).toBe('');
    expect(timeRangeText({ startTime: null, endTime: null })).toBe('All day');
    expect(timeRangeText({ startTime: '10:00', endTime: '12:00' })).toBe('10:00 am - 12:00 pm');
    expect(timeRangeText({ startTime: '10:00', endTime: null })).toBe('10:00 am');
  });
  it('writes date ranges', () => {
    expect(dateRangeText({ startsOn: '2026-12-05', endsOn: '2026-12-05' })).toBe('5 Dec');
    expect(dateRangeText({ startsOn: '2026-12-05', endsOn: '2026-12-07' })).toBe('5 Dec - 7 Dec');
  });
  it('moves months across year ends', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});
