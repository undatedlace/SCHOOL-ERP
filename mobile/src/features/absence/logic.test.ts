import {
  daysInMonth,
  daysLabel,
  firstDayRange,
  lastDayRange,
  monthCells,
  previewSentence,
  rangeLabel,
  shiftMonth,
} from './logic';

describe('previewSentence', () => {
  it('counts school days and says what was not counted', () => {
    expect(
      previewSentence({
        days: 2,
        problem: null,
        skipped: [
          { date: '2026-11-22', reason: 'SUNDAY' },
          { date: '2026-11-17', reason: 'HOLIDAY' },
        ],
      }),
    ).toEqual({ text: '2 school days; Sunday and 1 holiday not counted', ok: true });
  });
  it('pluralises Sundays and holidays', () => {
    const p = previewSentence({
      days: 5,
      problem: null,
      skipped: [
        { date: 'a', reason: 'SUNDAY' },
        { date: 'b', reason: 'SUNDAY' },
        { date: 'c', reason: 'HOLIDAY' },
        { date: 'd', reason: 'HOLIDAY' },
      ],
    });
    expect(p.text).toBe('5 school days; 2 Sundays and 2 holidays not counted');
  });
  it('says nothing extra when everything counts', () => {
    expect(previewSentence({ days: 1, problem: null, skipped: [] })).toEqual({ text: '1 school day', ok: true });
    expect(previewSentence({ days: 0.5, problem: null, skipped: [] }).text).toBe('Half a school day');
  });
  it('shows the API problem sentence as it is', () => {
    expect(previewSentence({ days: 0, skipped: [], problem: 'The first day cannot be in the past' })).toEqual({
      text: 'The first day cannot be in the past',
      ok: false,
    });
  });
});

describe('labels', () => {
  it('names a single day, a range and a half day', () => {
    expect(rangeLabel('2026-11-16', '2026-11-16', false)).toBe('Mon, 16 Nov');
    expect(rangeLabel('2026-11-16', '2026-11-18', false)).toBe('16 Nov to 18 Nov');
    expect(rangeLabel('2026-11-16', '2026-11-16', true)).toBe('Mon, 16 Nov (half day)');
    expect(daysLabel(3)).toBe('3 school days');
  });
});

describe('calendar', () => {
  it('knows the length of a month', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 11)).toBe(30);
  });
  it('lays a month out in Monday-first weeks', () => {
    // 1 Nov 2026 is a Sunday: six empty cells, then the 1st at the end of the first week.
    const weeks = monthCells(2026, 11);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks[1]![0]).toBe('2026-11-02');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks[weeks.length - 1]!.includes('2026-11-30')).toBe(true);
  });
  it('moves between months across a year end', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
  it('limits the days that can be chosen', () => {
    expect(firstDayRange('2026-11-14')).toEqual({ min: '2026-11-14', max: '2027-01-13' });
    expect(lastDayRange('2026-11-20').min).toBe('2026-11-20');
  });
});
