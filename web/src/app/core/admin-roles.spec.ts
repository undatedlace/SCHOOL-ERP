import { grantableRoles } from './admin-roles';

const roles = [
  { code: 'SUPER_ADMIN' },
  { code: 'SCHOOL_ADMIN' },
  { code: 'ACCOUNTANT' },
  { code: 'TEACHER' },
];

describe('grantableRoles', () => {
  it('offers every role to a Super Admin', () => {
    expect(grantableRoles(roles, true).map((r) => r.code)).toEqual([
      'SUPER_ADMIN',
      'SCHOOL_ADMIN',
      'ACCOUNTANT',
      'TEACHER',
    ]);
  });
  it('keeps admin roles out of the list for everyone else', () => {
    expect(grantableRoles(roles, false).map((r) => r.code)).toEqual(['ACCOUNTANT', 'TEACHER']);
  });
});
