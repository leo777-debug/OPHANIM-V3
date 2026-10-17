import { afterEach, expect, it, vi } from 'vitest';
import { databaseConnectionString } from './pool';

afterEach(() => vi.unstubAllEnvs());

it('uses the shared transaction pooler only for Supabase session URLs on serverless', () => {
  const original = 'postgresql://postgres.test:fixture%40password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require';
  const result = new URL(databaseConnectionString(original, true));
  expect(result.port).toBe('6543');
  expect(result.username).toBe('postgres.test');
  expect(result.password).toBe('fixture%40password');
  expect(result.searchParams.get('sslmode')).toBe('require');
  expect(databaseConnectionString(original, false)).toBe(original);
});

it.each([
  'postgresql://user:fixture@db.example.com:5432/app',
  'postgresql://user:fixture@db.test.supabase.co:5432/app',
  'postgresql://user:fixture@aws.pooler.supabase.com.evil.invalid:5432/app',
  'postgresql://user:fixture@aws.pooler.supabase.com:6543/app',
])('preserves other database destinations: %s', value => {
  expect(databaseConnectionString(value, true)).toBe(value);
});

it('does not include malformed connection details in its error', () => {
  expect(() => databaseConnectionString('private-invalid-credential', true))
    .toThrow('DATABASE_URL must be a valid PostgreSQL connection URL.');
});
