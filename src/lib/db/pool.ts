import { Pool } from 'pg';

let pool: Pool | undefined;

export function databaseConnectionString(value: string, serverless: boolean): string {
  if (!serverless) return value;
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.'); }
  // The shared transaction pooler avoids pinning a database session per function.
  if (url.hostname.endsWith('.pooler.supabase.com') && url.port === '5432') url.port = '6543';
  return url.toString();
}

export function db(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for persisted Ophanim data.');
  if (pool) return pool;
  pool = new Pool({
    connectionString: databaseConnectionString(process.env.DATABASE_URL, Boolean(process.env.VERCEL)),
    max: process.env.VERCEL ? 2 : 10,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
    application_name: 'ophanim',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });
  // pg removes disconnected idle clients; let later requests reconnect.
  pool.on('error', () => {});
  return pool;
}
