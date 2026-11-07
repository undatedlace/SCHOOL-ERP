import { ageInMonths, ageText, checkEligibility } from './age.js';

describe('ageInMonths', () => {
  it('counts whole months', () => {
    expect(ageInMonths('2021-03-10', '2026-06-15')).toBe(63);
    expect(ageInMonths('2021-06-15', '2026-06-15')).toBe(60); // on the birthday
  });

  it('does not count a month until its day has come', () => {
    expect(ageInMonths('2021-03-20', '2026-06-15')).toBe(62);
    expect(ageInMonths('2021-06-16', '2026-06-15')).toBe(59); // the day before the birthday
  });

  it('handles month ends and leap days', () => {
    expect(ageInMonths('2020-02-29', '2024-02-28')).toBe(47);
    expect(ageInMonths('2020-02-29', '2024-02-29')).toBe(48);
    expect(ageInMonths('2020-01-31', '2020-02-29')).toBe(0);
  });

  it('is null for a birth date after the counting date', () => {
    expect(ageInMonths('2027-01-01', '2026-06-15')).toBeNull();
  });
});

describe('ageText', () => {
  it('reads naturally', () => {
    expect(ageText(63)).toBe('5 years 3 months');
    expect(ageText(12)).toBe('1 year 0 months');
    expect(ageText(1)).toBe('1 month');
    expect(ageText(0)).toBe('0 months');
  });
});

describe('checkEligibility', () => {
  const base = {
    className: 'Nursery',
    asOn: '2026-07-31',
    minAgeYears: 3,
    admissionsOpen: true,
  };

  it('accepts a child old enough, counted on the date given', () => {
    const r = checkEligibility({ ...base, dateOfBirth: '2023-07-31' });
    expect(r).toMatchObject({
      eligible: true,
      issues: [],
      ageMonths: 36,
      ageText: '3 years 0 months',
      asOn: '2026-07-31',
    });
  });

  it('flags a child who is a day too young', () => {
    const r = checkEligibility({ ...base, dateOfBirth: '2023-08-01' });
    expect(r.eligible).toBe(false);
    expect(r.issues[0]).toBe(
      'The child is 2 years 11 months old as on 2026-07-31, and Nursery needs at least 3 years.',
    );
  });

  it('flags a class that is not open, even for the right age', () => {
    const r = checkEligibility({
      ...base,
      admissionsOpen: false,
      dateOfBirth: '2021-01-01',
    });
    expect(r.issues).toEqual(['Admissions are not open for Nursery.']);
  });

  it('reports both problems together', () => {
    expect(
      checkEligibility({
        ...base,
        admissionsOpen: false,
        dateOfBirth: '2025-01-01',
      }).issues,
    ).toHaveLength(2);
  });

  it('has no age rule when none is set, or when the date of birth is not known yet', () => {
    expect(
      checkEligibility({
        ...base,
        minAgeYears: null,
        dateOfBirth: '2026-01-01',
      }).eligible,
    ).toBe(true);
    const unknown = checkEligibility({ ...base, dateOfBirth: null });
    expect(unknown).toMatchObject({
      eligible: true,
      ageMonths: null,
      ageText: null,
    });
  });

  it('flags a birth date after the counting date', () => {
    expect(
      checkEligibility({ ...base, dateOfBirth: '2027-01-01' }).issues[0],
    ).toMatch(/after the date/);
  });

  it('says "1 year" in the singular', () => {
    expect(
      checkEligibility({ ...base, minAgeYears: 1, dateOfBirth: '2026-06-01' })
        .issues[0],
    ).toMatch(/at least 1 year\./);
  });
});
