import { cleanMobile, suggestGuardians } from './guardian-suggestions.js';

describe('cleanMobile', () => {
  it('removes spaces, dashes and brackets', () => {
    expect(cleanMobile('+91 98765-43210')).toBe('+919876543210');
    expect(cleanMobile('(022) 2345 6789')).toBe('02223456789');
  });

  it('returns nothing for text that is not a phone number', () => {
    expect(cleanMobile('call after 5')).toBe('');
    expect(cleanMobile('12345')).toBe('');
    expect(cleanMobile('')).toBe('');
  });
});

describe('suggestGuardians', () => {
  const answers = {
    fatherFullName: 'Imran Shaikh',
    fatherEmail: 'Imran@Example.com',
    fatherOccupation: 'Engineer',
    motherFullName: 'Ayesha Shaikh',
    motherOccupation: 'Teacher',
    familyMobile: '98765 43210',
  };

  it('suggests the father, then the mother, sharing the family mobile', () => {
    expect(suggestGuardians(answers)).toEqual([
      {
        fullName: 'Imran Shaikh',
        relationship: 'FATHER',
        mobile: '9876543210',
        email: 'imran@example.com',
        occupation: 'Engineer',
        isPrimary: true,
      },
      {
        fullName: 'Ayesha Shaikh',
        relationship: 'MOTHER',
        mobile: '9876543210',
        occupation: 'Teacher',
        isPrimary: false,
      },
    ]);
  });

  it('adds a guardian built from first, middle and last name', () => {
    const list = suggestGuardians({
      guardianFirstName: 'Zaid',
      guardianLastName: 'Khan',
      guardianMobile: '+91 90000 11111',
      guardianEmail: 'zaid@example.com',
    });
    expect(list).toEqual([
      {
        fullName: 'Zaid Khan',
        relationship: 'GUARDIAN',
        mobile: '+919000011111',
        email: 'zaid@example.com',
        isPrimary: true,
      },
    ]);
  });

  it('makes the first person suggested the primary contact', () => {
    const list = suggestGuardians({
      motherFullName: 'Ayesha',
      guardianFirstName: 'Zaid',
    });
    expect(list.map((g) => g.isPrimary)).toEqual([true, false]);
  });

  it('suggests nothing when the form has none of those answers', () => {
    expect(suggestGuardians({})).toEqual([]);
    expect(
      suggestGuardians({ fatherFullName: 5, motherFullName: '   ' }),
    ).toEqual([]);
  });

  it('drops a mobile number that is not valid', () => {
    expect(
      suggestGuardians({
        fatherFullName: 'Imran',
        familyMobile: 'ask the office',
      })[0],
    ).not.toHaveProperty('mobile');
  });
});
