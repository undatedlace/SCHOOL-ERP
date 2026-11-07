import {
  PORTAL_SESSION_MS,
  STAFF_SESSION_MS,
  hashToken,
  isPortalOnly,
  sessionCookieOptions,
  sessionLifetimeMs,
} from './auth.constants.js';

describe('auth constants', () => {
  it('hashes tokens deterministically and never returns the token', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('treats only parents and students as portal users', () => {
    expect(isPortalOnly(['PARENT'])).toBe(true);
    expect(isPortalOnly(['PARENT', 'STUDENT'])).toBe(true);
    expect(isPortalOnly(['PARENT', 'TEACHER'])).toBe(false);
    expect(isPortalOnly(['SCHOOL_ADMIN'])).toBe(false);
    expect(isPortalOnly([])).toBe(false);
  });

  it('gives portal users long sessions and everyone else short ones', () => {
    expect(sessionLifetimeMs(['PARENT'])).toBe(PORTAL_SESSION_MS);
    expect(sessionLifetimeMs(['TEACHER'])).toBe(STAFF_SESSION_MS);
    expect(sessionLifetimeMs([])).toBe(STAFF_SESSION_MS);
  });

  it('builds a hardened cookie', () => {
    expect(sessionCookieOptions(true, 1000)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000,
    });
  });
});
