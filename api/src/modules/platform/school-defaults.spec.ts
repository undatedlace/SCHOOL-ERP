import { isValidSchoolCode, schoolCodeFrom } from './school-defaults.js';

describe('school codes', () => {
  it('makes a code from a name', () => {
    expect(schoolCodeFrom('Heera English School')).toBe('heera-english-school');
    expect(schoolCodeFrom('  St. Mary’s (Andheri)  ')).toBe(
      'st-mary-s-andheri',
    );
    expect(schoolCodeFrom('!!')).toBe('school');
    expect(
      schoolCodeFrom('A very long school name that keeps going on'),
    ).toHaveLength(30);
  });

  it('accepts short lower-case codes with single hyphens only', () => {
    for (const ok of ['hesj', 'st-marys', 'a1', 'school-2'])
      expect(isValidSchoolCode(ok)).toBe(true);
    for (const bad of [
      'a',
      'HESJ',
      'st marys',
      '-hesj',
      'hesj-',
      'a--b',
      'x'.repeat(31),
    ])
      expect(isValidSchoolCode(bad)).toBe(false);
  });
});
