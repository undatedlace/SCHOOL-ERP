import { formatDate, fromIsoDate, toIsoDate } from './dates';

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
