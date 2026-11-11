import { markProblem, percentOf, statsOf } from './assessment-rules.js';

describe('percentOf', () => {
  it('rounds to one decimal and leaves absent or unmarked as null', () => {
    expect(percentOf(18, 20)).toBe(90);
    expect(percentOf(7, 9)).toBe(77.8);
    expect(percentOf(0, 20)).toBe(0);
    expect(percentOf(null, 20)).toBeNull();
    expect(percentOf(5, 0)).toBeNull();
  });
});

describe('statsOf', () => {
  it('averages those who sat it, and counts the absent apart', () => {
    const s = statsOf([
      { marks: 18, absent: false },
      { marks: 12, absent: false },
      { marks: 15, absent: false },
      { marks: null, absent: true },
      { marks: null, absent: false },
    ]);
    expect(s).toEqual({
      entered: 4,
      scored: 3,
      absent: 1,
      average: 15,
      highest: 18,
      lowest: 12,
    });
  });
  it('has no average with no scores', () => {
    expect(statsOf([])).toMatchObject({
      entered: 0,
      average: null,
      highest: null,
    });
    expect(statsOf([{ marks: null, absent: true }])).toMatchObject({
      absent: 1,
      average: null,
    });
  });
});

describe('markProblem', () => {
  it('refuses marks above the maximum, and marks for someone absent', () => {
    expect(markProblem({ marks: 21 }, 20)).toMatch(/more than 20/);
    expect(markProblem({ marks: 5, absent: true }, 20)).toMatch(/absent/);
    expect(markProblem({ marks: 20 }, 20)).toBeNull();
    expect(markProblem({ marks: null, absent: true }, 20)).toBeNull();
    expect(markProblem({ marks: 0 }, 20)).toBeNull();
  });
});
