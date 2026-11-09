import { shiftYears } from './fee-dates.js';

describe('shiftYears', () => {
  it('keeps the month and day', () => {
    expect(shiftYears('2026-04-10', 1)).toBe('2027-04-10');
    expect(shiftYears('2026-12-31', 1)).toBe('2027-12-31');
    expect(shiftYears('2026-04-10', 0)).toBe('2026-04-10');
    expect(shiftYears('2026-04-10', -1)).toBe('2025-04-10');
  });

  it('turns 29 February into 28 February when the year has no leap day', () => {
    expect(shiftYears('2028-02-29', 1)).toBe('2029-02-28');
    expect(shiftYears('2028-02-29', 4)).toBe('2032-02-29');
  });

  it('accepts a full timestamp', () => {
    expect(shiftYears('2026-04-10T00:00:00.000Z', 1)).toBe('2027-04-10');
  });
});
