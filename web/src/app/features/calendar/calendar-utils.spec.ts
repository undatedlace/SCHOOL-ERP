import { CalendarEvent } from '../../core/models';
import {
  dateRangeText,
  hourLabel,
  isAllDay,
  layoutTimed,
  shiftView,
  viewRange,
  viewTitle,
  yearMonths,
  weekDays,
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

describe('views', () => {
  it('finds the week (Sunday first) and the range each view needs', () => {
    // 9 Nov 2026 is a Monday.
    expect(weekDays('2026-11-09')[0]).toBe('2026-11-08');
    expect(weekDays('2026-11-09')[6]).toBe('2026-11-14');
    expect(viewRange('day', '2026-11-09')).toEqual({ from: '2026-11-09', to: '2026-11-09' });
    expect(viewRange('week', '2026-11-09')).toEqual({ from: '2026-11-08', to: '2026-11-14' });
    expect(viewRange('month', '2026-11-09')).toEqual(gridRange(2026, 10));
    expect(viewRange('year', '2026-11-09')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('steps by the view and never lands on a day that does not exist', () => {
    expect(shiftView('day', '2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftView('week', '2026-11-09', -1)).toBe('2026-11-02');
    expect(shiftView('month', '2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftView('month', '2026-01-15', -1)).toBe('2025-12-15');
    expect(shiftView('year', '2028-02-29', 1)).toBe('2029-02-28');
  });

  it('titles each view', () => {
    expect(viewTitle('year', '2026-11-09')).toBe('2026');
    expect(viewTitle('month', '2026-11-09')).toBe('November 2026');
    expect(viewTitle('day', '2026-11-09')).toContain('9 November 2026');
    expect(viewTitle('week', '2026-11-09')).toBe('8 - 14 November 2026');
    expect(viewTitle('week', '2026-12-01')).toBe('29 Nov - 5 Dec 2026');
  });

  it('labels hours', () => {
    expect(hourLabel(0)).toBe('12 AM');
    expect(hourLabel(9)).toBe('9 AM');
    expect(hourLabel(12)).toBe('12 PM');
    expect(hourLabel(15)).toBe('3 PM');
  });

  it('builds twelve months for the year view', () => {
    const months = yearMonths(2026);
    expect(months.length).toBe(12);
    expect(months[10].name).toBe('November');
    expect(months[10].weeks[0][0].iso).toBe('2026-11-01');
  });
});

describe('layoutTimed', () => {
  const at = (id: string, startTime: string, endTime: string | null) =>
    ev({ id, startTime, endTime });

  it('leaves all-day and multi-day events out of the hourly grid', () => {
    const placed = layoutTimed([
      ev({ id: 'a', startTime: null }),
      ev({ id: 'b', startTime: '09:00', endsOn: '2026-12-06' }),
      at('c', '09:00', '10:00'),
    ]);
    expect(placed.map((p) => p.event.id)).toEqual(['c']);
    expect(isAllDay(ev({ startTime: null }))).toBe(true);
  });

  it('times a block, defaulting to an hour and never shorter than half an hour', () => {
    const [one, two] = layoutTimed([at('a', '10:00', null), at('b', '12:00', '12:10')]);
    expect([one.startMin, one.endMin]).toEqual([600, 660]);
    expect([two.startMin, two.endMin]).toEqual([720, 750]);
  });

  it('puts overlapping events side by side and others on the full width', () => {
    const placed = layoutTimed([
      at('a', '09:00', '11:00'),
      at('b', '10:00', '12:00'),
      at('c', '11:00', '12:30'),
      at('d', '15:00', '16:00'),
    ]);
    const by = (id: string) => placed.find((p) => p.event.id === id)!;
    expect([by('a').lane, by('a').lanes]).toEqual([0, 2]);
    expect([by('b').lane, by('b').lanes]).toEqual([1, 2]);
    // c starts when a ends, so it takes a's lane.
    expect([by('c').lane, by('c').lanes]).toEqual([0, 2]);
    expect([by('d').lane, by('d').lanes]).toEqual([0, 1]);
  });
});
