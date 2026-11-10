import argon2 from 'argon2';
import { randomInt } from 'node:crypto';

// No look-alike characters (0/O, 1/l/I) so a temporary password is easy to read out.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export const hashPassword = (plain: string) =>
  argon2.hash(plain, { type: argon2.argon2id });

export const verifyPassword = (hash: string, plain: string) =>
  argon2.verify(hash, plain);

/** How many days a temporary password works (the school's rule: 2). Set TEMP_PASSWORD_DAYS to change it. */
export function tempPasswordDays(): number {
  const n = Number(process.env.TEMP_PASSWORD_DAYS);
  return Number.isInteger(n) && n >= 1 && n <= 30 ? n : 2;
}

/** The moment a temporary password issued now stops working. */
export const tempPasswordExpiry = (now: Date = new Date()): Date =>
  new Date(now.getTime() + tempPasswordDays() * 86_400_000);

export function generateTemporaryPassword(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
