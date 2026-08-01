import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 12 || password.length > 512) {
    throw new Error('Password must be between 12 and 512 characters.');
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  if (!encoded || typeof password !== 'string') return false;
  const [scheme, encodedSalt, encodedHash] = encoded.split('$');
  if (scheme !== 'scrypt' || !encodedSalt || !encodedHash) return false;
  try {
    const expected = Buffer.from(encodedHash, 'base64url');
    const actual = await scrypt(password, Buffer.from(encodedSalt, 'base64url'), expected.length) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
