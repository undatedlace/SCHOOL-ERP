import type { CookieOptions } from 'express';
import { createHash } from 'node:crypto';

export const SESSION_COOKIE = 'sid';
export const STAFF_SESSION_MS = 12 * 60 * 60 * 1000;
export const PORTAL_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

/** Only this hash is stored; the raw token lives in the user's cookie. */
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** Parents and students get long sliding sessions; everyone else gets short ones. */
export const isPortalOnly = (roleCodes: string[]) =>
  roleCodes.length > 0 &&
  roleCodes.every((c) => c === 'PARENT' || c === 'STUDENT');

export const sessionLifetimeMs = (roleCodes: string[]) =>
  isPortalOnly(roleCodes) ? PORTAL_SESSION_MS : STAFF_SESSION_MS;

export const sessionCookieOptions = (
  secure: boolean,
  maxAgeMs: number,
): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: 'lax',
  path: '/',
  maxAge: maxAgeMs,
});
