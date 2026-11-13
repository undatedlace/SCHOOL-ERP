import {
  parseChoice,
  parseDate,
  parseMobile,
  parseMoney,
  parseNumber,
  parseText,
  parseYesNo,
  plain,
} from './cells.js';

const value = <T>(p: { ok: boolean; value?: T; error?: string }) => {
  if (!p.ok) throw new Error(`expected ok, got: ${p.error}`);
  return p.value;
};
const error = (p: { ok: boolean; error?: string }) => {
  if (p.ok) throw new Error('expected an error');
  return p.error;
};

describe('plain (what a cell holds)', () => {
  it('unwraps formulas, rich text, hyperlinks and dates', () => {
    expect(plain({ formula: 'A1+1', result: 5 })).toBe(5);
    expect(plain({ richText: [{ text: 'Aa' }, { text: 'rav ' }] })).toBe(
      'Aarav',
    );
    expect(plain({ text: 'a@b.in', hyperlink: 'mailto:a@b.in' })).toBe(
      'a@b.in',
    );
    expect(plain(new Date('2025-06-01T00:00:00Z'))).toBe('2025-06-01');
    expect(plain({ error: '#N/A' })).toBeNull();
    expect(plain('   ')).toBeNull();
    expect(plain(undefined)).toBeNull();
  });
});

describe('parseDate', () => {
  it('reads day-first dates the way they are written in India', () => {
    expect(value(parseDate('05/06/2024', 'D'))).toBe('2024-06-05');
    expect(value(parseDate('5-6-24', 'D'))).toBe('2024-06-05');
    expect(value(parseDate('5.6.2024', 'D'))).toBe('2024-06-05');
    expect(value(parseDate('5 Jun 2024', 'D'))).toBe('2024-06-05');
    expect(value(parseDate('05-June-2024', 'D'))).toBe('2024-06-05');
    expect(value(parseDate('2024-06-05', 'D'))).toBe('2024-06-05');
  });

  it('reads Excel day numbers', () => {
    expect(value(parseDate(45448, 'D'))).toBe('2024-06-05');
    expect(value(parseDate(1, 'D'))).toBe('1899-12-31');
  });

  it('treats a blank cell as no date', () => {
    expect(value(parseDate(null, 'D'))).toBeNull();
    expect(value(parseDate('', 'D'))).toBeNull();
  });

  it('refuses dates that do not exist and things that are not dates', () => {
    expect(error(parseDate('31/02/2024', 'Date of birth'))).toContain(
      'Date of birth',
    );
    expect(error(parseDate('13/13/2024', 'D'))).toBeTruthy();
    expect(error(parseDate('soon', 'D'))).toBeTruthy();
    expect(error(parseDate(12.5, 'D'))).toBeTruthy();
    expect(error(parseDate(true, 'D'))).toBeTruthy();
  });
});

describe('parseMoney', () => {
  it('turns rupees into text with two decimals, never floating point', () => {
    expect(value(parseMoney(1500, 'Paid'))).toBe('1500.00');
    expect(value(parseMoney(1500.5, 'Paid'))).toBe('1500.50');
    expect(value(parseMoney(0.1 + 0.2, 'Paid'))).toBe('0.30');
    expect(value(parseMoney('₹ 1,25,000', 'Paid'))).toBe('125000.00');
    expect(value(parseMoney('Rs. 99.9', 'Paid'))).toBe('99.90');
    expect(value(parseMoney(null, 'Paid'))).toBeNull();
  });

  it('refuses fractions of a paisa, negatives and words', () => {
    expect(error(parseMoney(10.555, 'Paid'))).toContain('two decimals');
    expect(error(parseMoney('10.555', 'Paid'))).toBeTruthy();
    expect(error(parseMoney(-5, 'Paid'))).toContain('negative');
    expect(error(parseMoney('-5', 'Paid'))).toContain('negative');
    expect(error(parseMoney('five', 'Paid'))).toBeTruthy();
  });
});

describe('parseNumber, parseYesNo, parseText', () => {
  it('reads numbers typed as text', () => {
    expect(value(parseNumber('1,200', 'N'))).toBe(1200);
    expect(value(parseNumber(7, 'N'))).toBe(7);
    expect(error(parseNumber('seven', 'N'))).toBeTruthy();
  });

  it('reads yes and no in the usual ways', () => {
    for (const yes of ['Yes', 'y', 'TRUE', 1, true])
      expect(value(parseYesNo(yes, 'Q'))).toBe(true);
    for (const no of ['No', 'n', 'false', 0, false])
      expect(value(parseYesNo(no, 'Q'))).toBe(false);
    expect(value(parseYesNo(null, 'Q'))).toBeNull();
    expect(error(parseYesNo('maybe', 'Q'))).toContain('Yes or No');
  });

  it('keeps numbers typed into a text column as typed', () => {
    expect(value(parseText(400001, 'Pin code'))).toBe('400001');
    expect(error(parseText('x'.repeat(31), 'Form no', 30))).toContain('30');
  });
});

describe('parseMobile', () => {
  it('accepts numbers Excel turned into numbers, and the usual punctuation', () => {
    expect(value(parseMobile(9876543210, 'M'))).toBe('9876543210');
    expect(value(parseMobile('+91 98765-43210', 'M'))).toBe('+919876543210');
    expect(value(parseMobile('(022) 2345 6789', 'M'))).toBe('02223456789');
    expect(error(parseMobile('12345', 'M'))).toBeTruthy();
  });
});

describe('parseChoice', () => {
  const divisions = [
    { value: 'd1', label: 'Std 1 - A' },
    { value: 'd2', label: 'Std 1 - B' },
  ];

  it('matches labels ignoring case, spacing and the kind of dash', () => {
    expect(value(parseChoice('std 1 – a', divisions, 'Class'))).toBe('d1');
    expect(value(parseChoice('Std 1-B', divisions, 'Class'))).toBe('d2');
    expect(value(parseChoice('STD  1  -  B', divisions, 'Class'))).toBe('d2');
  });

  it('also matches the stored value, and names the choices when nothing matches', () => {
    expect(
      value(parseChoice('MALE', [{ value: 'MALE', label: 'Boy' }], 'Gender')),
    ).toBe('MALE');
    expect(error(parseChoice('Std 9', divisions, 'Class'))).toContain(
      'Std 1 - A',
    );
  });
});
