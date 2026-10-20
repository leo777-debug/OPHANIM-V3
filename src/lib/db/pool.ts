import { Pool } from 'pg';

let pool: Pool | undefined;
let runtimePool: Pool | undefined;

export function db(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for persisted Ophanim data.');
  return pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });
}

/** Operational metadata must never hold public feed responses behind a database outage. */
export function runtimeDb(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for persisted runtime metadata.');
  if (!runtimePool) {
    runtimePool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
      max: 2, connectionTimeoutMillis: 3000, query_timeout: 5000, statement_timeout: 5000,
      idleTimeoutMillis: 10000,
    });
    runtimePool.on('error', () => { /* Idle metadata connection failed; requests use the explicit memory fallback. */ });
  }
  return runtimePool;
}
