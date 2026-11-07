import { ageText, formatDate, fromIsoDate, toIsoDate } from './dates';

describe('date helpers', () => {
  it('round-trips a calendar date without shifting it', () => {
    expect(toIsoDate(fromIsoDate('2026-04-01'))).toBe('2026-04-01');
    expect(toIsoDate(fromIsoDate('2027-03-31'))).toBe('2027-03-31');
  });

  it('accepts the API date-time form', () => {
    expect(toIsoDate(fromIsoDate('2026-04-01T00:00:00.000Z'))).toBe('2026-04-01');
  });

  it('pads months and days', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('formats for display', () => {
    expect(formatDate('2026-04-01')).toMatch(/01 Apr 2026/);
  });
});

describe('ageText', () => {
  const asOf = new Date(2026, 5, 15); // 15 June 2026

  it('gives years and months', () => {
    expect(ageText('2021-03-10', asOf)).toBe('5 years 3 months');
    expect(ageText('2021-06-15', asOf)).toBe('5 years 0 months');
  });

  it('does not count a month until the day of the month has come', () => {
    expect(ageText('2021-03-20', asOf)).toBe('5 years 2 months');
  });

  it('handles children under one year and singular units', () => {
    expect(ageText('2026-01-01', asOf)).toBe('5 months');
    expect(ageText('2025-05-10', asOf)).toBe('1 year 1 month');
  });

  it('returns nothing for a date in the future', () => {
    expect(ageText('2027-01-01', asOf)).toBe('');
  });
});
