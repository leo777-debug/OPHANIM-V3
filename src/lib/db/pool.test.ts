import { afterEach, describe, expect, it, vi } from 'vitest';
const connection = vi.hoisted(() => ({ on: vi.fn() }));
const Pool = vi.hoisted(() => vi.fn(function () { return connection; }));
vi.mock('pg', () => ({ Pool }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });
describe('isolated operational metadata connection budget', () => {
  it('caps connections and timeouts without disabling production certificate checks', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://synthetic-test'); vi.stubEnv('NODE_ENV', 'production');
    const { runtimeDb } = await import('./pool'); runtimeDb(); runtimeDb();
    expect(Pool).toHaveBeenCalledTimes(1);
    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ max: 2, connectionTimeoutMillis: 3000, query_timeout: 5000, statement_timeout: 5000, ssl: { rejectUnauthorized: true } }));
    expect(connection.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
  it('does not open a connection when no database was configured', async () => {
    vi.stubEnv('DATABASE_URL', ''); const { runtimeDb } = await import('./pool');
    expect(() => runtimeDb()).toThrow('DATABASE_URL'); expect(Pool).not.toHaveBeenCalled();
  });
});

import { databaseConnectionString } from './pool';


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
