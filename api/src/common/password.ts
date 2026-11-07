import argon2 from 'argon2';
import { randomInt } from 'node:crypto';

// No look-alike characters (0/O, 1/l/I) so a temporary password is easy to read out.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export const hashPassword = (plain: string) =>
  argon2.hash(plain, { type: argon2.argon2id });

export const verifyPassword = (hash: string, plain: string) =>
  argon2.verify(hash, plain);

export function generateTemporaryPassword(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
