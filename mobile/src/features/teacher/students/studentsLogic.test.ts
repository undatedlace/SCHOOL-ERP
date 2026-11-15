import { ageText, classLine, classOfDivision, listQuery, orderedGuardians, telHref, type ClassWithDivisions } from './studentsLogic';

const classes: ClassWithDivisions[] = [
  { id: 'c-n', name: 'Nursery', divisions: [{ id: 'd-na', name: 'A' }, { id: 'd-nb', name: 'B' }] },
  { id: 'c-1', name: 'Std 1', divisions: [{ id: 'd-1a', name: 'A' }] },
];

describe('classOfDivision', () => {
  it('finds the class a division is in, or all', () => {
    expect(classOfDivision(classes, 'd-nb')).toBe('c-n');
    expect(classOfDivision(classes, 'd-1a')).toBe('c-1');
    expect(classOfDivision(classes, 'nope')).toBe('all');
    expect(classOfDivision(classes, undefined)).toBe('all');
    expect(classOfDivision([], 'd-na')).toBe('all');
  });
});

describe('listQuery', () => {
  const base = { search: '', classId: 'all', divisionId: 'all', status: 'ACTIVE' as const };

  it('sends only what is set', () => {
    expect(listQuery(base)).toEqual({ status: 'ACTIVE' });
    expect(listQuery({ ...base, classId: 'c-n' })).toEqual({ status: 'ACTIVE', classId: 'c-n' });
    expect(listQuery({ ...base, status: 'LEFT' })).toEqual({ status: 'LEFT' });
  });

  it('lets a division win over its class', () => {
    expect(listQuery({ ...base, classId: 'c-n', divisionId: 'd-na' })).toEqual({ status: 'ACTIVE', divisionId: 'd-na' });
  });

  it('searches from two letters, trimmed', () => {
    expect(listQuery({ ...base, search: ' a ' })).toEqual({ status: 'ACTIVE' });
    expect(listQuery({ ...base, search: ' Diya ' })).toEqual({ status: 'ACTIVE', search: 'Diya' });
  });
});

describe('classLine', () => {
  it('writes the class and division, or says there is none', () => {
    expect(
      classLine({ current: { academicYear: { id: 'y', name: '2026-27' }, class: { id: 'c', name: 'Nursery' }, division: { id: 'd', name: 'A' } } }),
    ).toBe('Nursery-A');
    expect(classLine({ current: null })).toBe('No class this year');
  });
});

describe('ageText', () => {
  it('counts whole years and months from a date of birth, before and after the birthday', () => {
    expect(ageText('2021-08-15T00:00:00.000Z', '2026-11-15')).toBe('5 years 3 months');
    expect(ageText('2021-11-16', '2026-11-15')).toBe('4 years 11 months');
    expect(ageText('2021-11-15', '2026-11-15')).toBe('5 years');
    expect(ageText('2025-10-01', '2026-11-15')).toBe('1 year 1 month');
  });

  it('is null for nothing, nonsense, or a birthday in the future', () => {
    expect(ageText(null, '2026-11-15')).toBeNull();
    expect(ageText('soon', '2026-11-15')).toBeNull();
    expect(ageText('2027-01-01', '2026-11-15')).toBeNull();
  });
});

describe('telHref', () => {
  it('keeps digits and a leading plus only', () => {
    expect(telHref('9000000001')).toBe('tel:9000000001');
    expect(telHref(' +91 90000-00001 ')).toBe('tel:+919000000001');
    expect(telHref('91+9000000001')).toBe('tel:919000000001');
  });

  it('gives nothing to dial for empty or too-short numbers', () => {
    expect(telHref(null)).toBeNull();
    expect(telHref('')).toBeNull();
    expect(telHref('12')).toBeNull();
  });
});

describe('orderedGuardians', () => {
  it('puts the primary contact first, then father, mother and others', () => {
    const rows = [
      { id: 'o', isPrimary: false, relationship: 'OTHER' as const },
      { id: 'm', isPrimary: false, relationship: 'MOTHER' as const },
      { id: 'f', isPrimary: true, relationship: 'FATHER' as const },
      { id: 'g', isPrimary: false, relationship: 'GUARDIAN' as const },
    ];
    expect(orderedGuardians(rows).map((r) => r.id)).toEqual(['f', 'm', 'g', 'o']);
    expect(orderedGuardians([{ id: 'm', isPrimary: true, relationship: 'MOTHER' as const }, { id: 'f', isPrimary: false, relationship: 'FATHER' as const }]).map((r) => r.id)).toEqual(['m', 'f']);
  });
});
