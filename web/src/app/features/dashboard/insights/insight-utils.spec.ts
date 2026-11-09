import { changeText, linePath, monthLabel, widthPercent } from './insight-utils';

describe('insight utils', () => {
  it('scales a bar between nothing and the whole', () => {
    expect(widthPercent(50, 200)).toBe(25);
    expect(widthPercent(0, 200)).toBe(0);
    expect(widthPercent(5, 0)).toBe(0);
    expect(widthPercent(300, 200)).toBe(100);
  });

  it('draws a line left to right, higher values nearer the top', () => {
    expect(linePath([0, 100], 100, 50)).toBe('M0 50 L100 0');
    expect(linePath([50], 100, 50)).toBe('M0 25');
    expect(linePath([], 100, 50)).toBe('');
  });

  it('leaves a gap for a missing value instead of dropping to zero', () => {
    expect(linePath([100, null, 100], 100, 50)).toBe('M0 0 M100 0');
  });

  it('keeps values outside the scale on the chart', () => {
    expect(linePath([150, -20], 10, 10)).toBe('M0 0 L10 10');
  });

  it('describes the change from the year before', () => {
    expect(changeText(120, 100)).toBe('+20%');
    expect(changeText(80, 100)).toBe('-20%');
    expect(changeText(100, 100)).toBe('0%');
    expect(changeText(5, 0)).toBe('');
    expect(changeText(5, null)).toBe('');
  });

  it('names a month', () => {
    expect(monthLabel('2026-04')).toBe('Apr');
    expect(monthLabel('2027-01')).toBe('Jan');
  });
});
