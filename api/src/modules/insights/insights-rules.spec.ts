import { changePercent, monthsBetween } from './insights-rules.js';

describe('insights rules', () => {
  it('lists every month of an academic year, across the new year', () => {
    const months = monthsBetween('2026-04-01', '2027-03-31');
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2026-04');
    expect(months[8]).toBe('2026-12');
    expect(months[9]).toBe('2027-01');
    expect(months[11]).toBe('2027-03');
  });

  it('handles a single month and a backwards range', () => {
    expect(monthsBetween('2026-11-05', '2026-11-20')).toEqual(['2026-11']);
    expect(monthsBetween('2027-01-01', '2026-01-01')).toEqual([]);
  });

  it('works out the change from the year before', () => {
    expect(changePercent(120, 100)).toBe(20);
    expect(changePercent(80, 100)).toBe(-20);
    expect(changePercent(100, 100)).toBe(0);
    expect(changePercent(5, 0)).toBeNull();
    expect(changePercent(5, null)).toBeNull();
  });
});
