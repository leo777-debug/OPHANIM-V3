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
