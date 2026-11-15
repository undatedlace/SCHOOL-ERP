import {
  addDays,
  dayOf,
  daysBetween,
  formatClock,
  formatDateTime,
  formatDay,
  greeting,
  istParts,
  minutesNowIST,
  minutesOf,
  startOfDayIST,
  startOfWeek,
  timeAgo,
  todayIST,
  weekdayOf,
} from './dates';

// 2026-11-14 18:29 UTC is 23:59 in India; one minute later it is already the 15th.
const LATE_14TH = new Date('2026-11-14T18:29:00Z');
const EARLY_15TH = new Date('2026-11-14T18:30:00Z');

describe('India time', () => {
  it('reads the calendar day and clock in IST, not UTC', () => {
    expect(todayIST(LATE_14TH)).toBe('2026-11-14');
    expect(todayIST(EARLY_15TH)).toBe('2026-11-15');
    expect(istParts(EARLY_15TH)).toMatchObject({ year: 2026, month: 11, day: 15, hour: 0, minute: 0 });
  });

  it('crosses a year end in IST', () => {
    expect(todayIST(new Date('2026-12-31T18:30:00Z'))).toBe('2027-01-01');
  });

  it('works out minutes since midnight in IST', () => {
    expect(minutesNowIST(new Date('2026-11-14T04:30:00Z'))).toBe(10 * 60);
  });

  it('knows the start of an India day as a moment', () => {
    expect(startOfDayIST('2026-11-15').toISOString()).toBe('2026-11-14T18:30:00.000Z');
  });
});

describe('day arithmetic', () => {
  it('adds days across month and year ends and leap days', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('counts days between', () => {
    expect(daysBetween('2026-11-14', '2026-11-21')).toBe(7);
    expect(daysBetween('2026-11-21', '2026-11-14')).toBe(-7);
  });
  it('finds the weekday and the Monday of a week', () => {
    expect(weekdayOf('2026-11-14')).toBe(6); // Saturday
    expect(startOfWeek('2026-11-14')).toBe('2026-11-09');
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09'); // Sunday belongs to the week before
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09');
  });
});

describe('date-only values from the API', () => {
  it('takes the day part', () => {
    expect(dayOf('2023-08-02T00:00:00.000Z')).toBe('2023-08-02');
    expect(dayOf('2023-08-02')).toBe('2023-08-02');
    expect(dayOf('nope')).toBeNull();
    expect(dayOf(null)).toBeNull();
  });
  it('formats them in several styles', () => {
    expect(formatDay('2026-11-14T00:00:00.000Z')).toBe('14 Nov 2026');
    expect(formatDay('2026-11-14', 'dayMonth')).toBe('14 Nov');
    expect(formatDay('2026-11-14', 'short')).toBe('Sat, 14 Nov');
    expect(formatDay('2026-11-14', 'long')).toBe('14 November 2026');
    expect(formatDay('2026-11-14', 'weekday')).toBe('Saturday, 14 November');
    expect(formatDay(null)).toBe('–');
  });
  it('formats a moment as the India day it falls on', () => {
    expect(formatDay(EARLY_15TH)).toBe('15 Nov 2026');
  });
});

describe('clock times', () => {
  it.each([
    ['00:00', '12:00 am'],
    ['08:05', '8:05 am'],
    ['12:00', '12:00 pm'],
    ['14:30', '2:30 pm'],
    ['23:59', '11:59 pm'],
  ])('%s -> %s', (input, expected) => {
    expect(formatClock(input)).toBe(expected);
  });
  it('refuses nonsense', () => {
    expect(formatClock('25:00')).toBe('–');
    expect(formatClock('soon')).toBe('–');
    expect(formatClock(null)).toBe('–');
  });
  it('turns HH:mm into minutes', () => {
    expect(minutesOf('09:30')).toBe(570);
    expect(minutesOf('x')).toBeNull();
  });
  it('shows a moment in India time', () => {
    expect(formatDateTime('2026-11-14T09:00:00Z')).toBe('14 Nov, 2:30 pm');
  });
});

describe('greeting', () => {
  it('follows the hour in India', () => {
    expect(greeting(new Date('2026-11-14T02:00:00Z'))).toBe('Good morning'); // 07:30
    expect(greeting(new Date('2026-11-14T08:00:00Z'))).toBe('Good afternoon'); // 13:30
    expect(greeting(new Date('2026-11-14T13:00:00Z'))).toBe('Good evening'); // 18:30
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-11-14T10:00:00Z');
  it('says it in words', () => {
    expect(timeAgo('2026-11-14T09:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-11-14T09:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-11-14T07:00:00Z', now)).toBe('3 hours ago');
    expect(timeAgo('2026-11-13T05:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-11-10T05:00:00Z', now)).toBe('4 days ago');
    expect(timeAgo('2026-10-01T05:00:00Z', now)).toBe('1 Oct 2026');
  });
});
