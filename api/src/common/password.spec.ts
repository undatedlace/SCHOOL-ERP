import {
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from './password.js';

describe('password helpers', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('generates readable, unique temporary passwords', () => {
    const a = generateTemporaryPassword();
    const b = generateTemporaryPassword();
    expect(a).toHaveLength(12);
    expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    expect(a).not.toBe(b);
  });
});
