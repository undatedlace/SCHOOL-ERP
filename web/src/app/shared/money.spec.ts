import { inr, isMoney } from './money';

describe('money', () => {
  it('shows rupees with Indian digit grouping and two decimals', () => {
    expect(inr('31200.50')).toBe('₹31,200.50');
    expect(inr('100000')).toBe('₹1,00,000.00');
    expect(inr('0.5')).toBe('₹0.50');
    expect(inr('-250.00')).toBe('-₹250.00');
    expect(inr(null)).toBe('');
  });

  it('accepts only real amounts', () => {
    for (const ok of ['1', '1500', '1500.5', '1500.50']) expect(isMoney(ok), ok).toBe(true);
    for (const bad of ['', '0', '0.00', '-5', '1.234', '1,000', 'abc', '1e3'])
      expect(isMoney(bad), bad).toBe(false);
  });
});
