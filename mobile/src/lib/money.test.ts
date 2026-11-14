import {
  formatPaise,
  formatRupees,
  groupIndian,
  paiseToRupeesText,
  parsePaise,
  parseRupees,
  sumRupees,
} from './money';

describe('groupIndian', () => {
  it.each([
    ['0', '0'],
    ['999', '999'],
    ['1000', '1,000'],
    ['12345', '12,345'],
    ['123456', '1,23,456'],
    ['1234567', '12,34,567'],
    ['123456789', '12,34,56,789'],
  ])('%s -> %s', (input, expected) => {
    expect(groupIndian(input)).toBe(expected);
  });
});

describe('parseRupees (decimal text to whole paise)', () => {
  it.each([
    ['1500', 150000],
    ['1500.00', 150000],
    ['1500.5', 150050],
    ['0.05', 5],
    ['0.5', 50],
    ['₹ 1,23,456.50', 12345650],
    ['Rs. 2,000', 200000],
    ['-250.00', -25000],
    ['−250', -25000],
    ['+10', 1000],
    ['0', 0],
    ['-0', 0],
  ])('%s -> %s', (input, expected) => {
    expect(parseRupees(input)).toBe(expected);
  });

  it.each(['', ' ', 'abc', '12.345', '1.2.3', '1e5', '.5', '5.', '--5'])('refuses %j', (input) => {
    expect(parseRupees(input)).toBeNull();
  });

  it('refuses things that are not text', () => {
    expect(parseRupees(null)).toBeNull();
    expect(parseRupees(undefined)).toBeNull();
  });

  it('never goes through floating point: 0.1 + 0.2 style amounts are exact', () => {
    expect(parseRupees('0.10')! + parseRupees('0.20')!).toBe(30);
    expect(parseRupees('19.99')).toBe(1999);
    expect(parseRupees('1.15')).toBe(115); // 1.15 * 100 is 114.99999999999999 in floating point
  });
});

describe('parsePaise', () => {
  it('reads integers and digit strings', () => {
    expect(parsePaise(150000)).toBe(150000);
    expect(parsePaise('150000')).toBe(150000);
    expect(parsePaise('-5')).toBe(-5);
  });
  it('refuses fractions and junk', () => {
    expect(parsePaise(1.5)).toBeNull();
    expect(parsePaise('1.5')).toBeNull();
    expect(parsePaise('x')).toBeNull();
    expect(parsePaise(null)).toBeNull();
  });
});

describe('formatPaise', () => {
  it.each([
    [0, '₹0'],
    [5, '₹0.05'],
    [100, '₹1'],
    [150000, '₹1,500'],
    [150050, '₹1,500.50'],
    [12345650, '₹1,23,456.50'],
    [1000000000, '₹1,00,00,000'],
    [-25000, '-₹250'],
    [-5, '-₹0.05'],
  ])('%s -> %s', (paise, expected) => {
    expect(formatPaise(paise)).toBe(expected);
  });

  it('can always show two decimals, or drop the rupee sign', () => {
    expect(formatPaise(150000, { fixed: true })).toBe('₹1,500.00');
    expect(formatPaise(150000, { plain: true })).toBe('1,500');
  });
});

describe('formatRupees (API text to display)', () => {
  it('formats what the API sends', () => {
    expect(formatRupees('1500.00')).toBe('₹1,500');
    expect(formatRupees('1234567.80')).toBe('₹12,34,567.80');
    expect(formatRupees('1500.00', { fixed: true })).toBe('₹1,500.00');
  });
  it('shows a dash when the value cannot be read', () => {
    expect(formatRupees(null)).toBe('–');
    expect(formatRupees('soon')).toBe('–');
  });
});

describe('paiseToRupeesText and sumRupees', () => {
  it('writes the text the API expects', () => {
    expect(paiseToRupeesText(150050)).toBe('1500.50');
    expect(paiseToRupeesText(5)).toBe('0.05');
    expect(paiseToRupeesText(-25000)).toBe('-250.00');
  });
  it('adds amounts exactly and treats unreadable ones as zero', () => {
    expect(sumRupees(['0.10', '0.20', null, 'x', '1000.00'])).toBe(100030);
  });
});
