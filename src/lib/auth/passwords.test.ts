import { describe, expect, it } from 'vitest';
import { hashPassword, validatePassword, verifyPassword } from './passwords';

describe('password authentication', () => {
  it('verifies the original password and rejects a different one', async () => {
    const encoded = await hashPassword('a long test password');
    await expect(verifyPassword('a long test password', encoded)).resolves.toBe(true);
    await expect(verifyPassword('another password', encoded)).resolves.toBe(false);
  });

  it('requires a production-safe password length', () => {
    expect(() => validatePassword('short')).toThrow('between 12 and 512');
  });
});
