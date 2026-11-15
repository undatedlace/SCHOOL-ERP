import {
  addMonths,
  categoriesByDay,
  daysInMonth,
  dateSpanText,
  eventsOnDay,
  firstOfMonth,
  gridRange,
  groupByStartDay,
  lastOfMonth,
  monthOf,
  monthTitle,
  monthWeeks,
  timeText,
} from './calendar-rules';
import type { CalendarEvent } from './types';

function event(over: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'e',
    title: 'Event',
    description: null,
    category: 'EVENT',
    startsOn: '2026-11-14',
    endsOn: '2026-11-14',
    startTime: null,
    endTime: null,
    audience: 'ALL',
    ...over,
  };
}

describe('months', () => {
  it('moves across year ends', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 3 }, 0)).toEqual({ year: 2026, month: 3 });
  });
  it('knows month lengths, including leap years', () => {
    expect(daysInMonth({ year: 2026, month: 11 })).toBe(30);
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2027, month: 2 })).toBe(28);
  });
  it('names and bounds a month', () => {
    const ym = monthOf('2026-11-14');
    expect(ym).toEqual({ year: 2026, month: 11 });
    expect(monthTitle(ym)).toBe('November 2026');
    expect(firstOfMonth(ym)).toBe('2026-11-01');
    expect(lastOfMonth(ym)).toBe('2026-11-30');
  });
});

describe('monthWeeks', () => {
  it('starts on a Monday and covers the whole month in whole weeks', () => {
    // 1 November 2026 is a Sunday, so the first row starts on Monday 26 October.
    const weeks = monthWeeks({ year: 2026, month: 11 });
    expect(weeks).toHaveLength(6);
    expect(weeks[0]![0]).toBe('2026-10-26');
    expect(weeks[0]![6]).toBe('2026-11-01');
    expect(weeks[5]![6]).toBe('2026-12-06');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it('uses four rows when a 28-day month starts on a Monday', () => {
    const weeks = monthWeeks({ year: 2027, month: 2 });
    expect(weeks).toHaveLength(4);
    expect(weeks[0]![0]).toBe('2027-02-01');
    expect(weeks[3]![6]).toBe('2027-02-28');
  });
  it('gives the range to ask the API for', () => {
    expect(gridRange({ year: 2026, month: 11 })).toEqual({ from: '2026-10-26', to: '2026-12-06' });
  });
});

describe('eventsOnDay', () => {
  const events = [
    event({ id: 'a', title: 'Meeting', startTime: '10:00' }),
    event({ id: 'b', title: 'Holiday', category: 'HOLIDAY' }),
    event({ id: 'c', title: 'Camp', startsOn: '2026-11-12', endsOn: '2026-11-16' }),
    event({ id: 'd', title: 'Other day', startsOn: '2026-11-20', endsOn: '2026-11-20' }),
  ];
  it('includes events that span the day, all-day first then by time', () => {
    expect(eventsOnDay(events, '2026-11-14').map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });
  it('is empty on a free day', () => {
    expect(eventsOnDay(events, '2026-11-18')).toEqual([]);
  });
});

describe('categoriesByDay', () => {
  it('marks every day an event covers, once per kind, and stays inside the range', () => {
    const map = categoriesByDay(
      [
        event({ id: 'a', category: 'HOLIDAY', startsOn: '2026-11-13', endsOn: '2026-11-15' }),
        event({ id: 'b', category: 'HOLIDAY', startsOn: '2026-11-14', endsOn: '2026-11-14' }),
        event({ id: 'c', category: 'EXAM', startsOn: '2026-11-14', endsOn: '2026-11-14' }),
        event({ id: 'd', category: 'EVENT', startsOn: '2026-12-30', endsOn: '2027-01-02' }),
      ],
      '2026-11-10',
      '2026-11-20',
    );
    expect(map.get('2026-11-13')).toEqual(['HOLIDAY']);
    expect(map.get('2026-11-14')).toEqual(['HOLIDAY', 'EXAM']);
    expect(map.get('2026-11-15')).toEqual(['HOLIDAY']);
    expect(map.has('2026-11-16')).toBe(false);
    expect(map.has('2027-01-01')).toBe(false);
  });
});

describe('timeText and dateSpanText', () => {
  it('writes the time in 12 hour form', () => {
    expect(timeText({ startTime: null, endTime: null })).toBe('All day');
    expect(timeText({ startTime: '09:00', endTime: '12:30' })).toBe('9:00 am to 12:30 pm');
    expect(timeText({ startTime: '15:00', endTime: null })).toBe('3:00 pm');
  });
  it('writes one day or a span', () => {
    expect(dateSpanText({ startsOn: '2026-11-14', endsOn: '2026-11-14' })).toBe('14 Nov');
    expect(dateSpanText({ startsOn: '2026-11-14', endsOn: '2026-11-16' })).toBe('14 Nov to 16 Nov');
  });
});

describe('groupByStartDay', () => {
  it('groups a month by the day each event first shows, in order', () => {
    const groups = groupByStartDay(
      [
        event({ id: 'a', startsOn: '2026-11-20', endsOn: '2026-11-20' }),
        event({ id: 'b', startsOn: '2026-10-28', endsOn: '2026-11-03' }),
        event({ id: 'c', startsOn: '2026-11-03', endsOn: '2026-11-03' }),
        event({ id: 'out', startsOn: '2026-12-02', endsOn: '2026-12-02' }),
      ],
      '2026-11-01',
      '2026-11-30',
    );
    expect(groups.map((g) => [g.day, g.events.map((e) => e.id)])).toEqual([
      ['2026-11-01', ['b']],
      ['2026-11-03', ['c']],
      ['2026-11-20', ['a']],
    ]);
  });
});
