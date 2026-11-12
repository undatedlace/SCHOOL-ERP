import type { CookieOptions } from 'express';

/** The owner's cookie: its own name, and sent only to /api/platform, never to a school's routes. */
export const PLATFORM_COOKIE = 'psid';
export const PLATFORM_COOKIE_PATH = '/api/platform';
/** Owners hold power over every school, so their sessions are short. */
export const PLATFORM_SESSION_MS = 8 * 60 * 60 * 1000;

export const platformCookieOptions = (
  secure: boolean,
  maxAgeMs: number,
): CookieOptions => ({
  httpOnly: true,
  secure,
  // Strict: an owner's session is never sent on a request that started on another site.
  sameSite: 'strict',
  path: PLATFORM_COOKIE_PATH,
  maxAge: maxAgeMs,
});

export interface OwnerContext {
  ownerId: string;
  sessionId: string;
  fullName: string;
  email: string;
  mustChangePassword: boolean;
}

export const PLATFORM_OPEN_KEY = 'platformOpen';
