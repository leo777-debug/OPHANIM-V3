import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const { Pool } = pg;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to run database migrations.');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

try {
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock(846151209)');
    await client.query(`create table if not exists ophanim_schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )`);
    const files = (await readdir(migrationDirectory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    for (const name of files) {
      const sql = await readFile(path.join(migrationDirectory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query('select checksum from ophanim_schema_migrations where name = $1', [name]);
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== checksum) throw new Error(`Migration checksum changed after application: ${name}`);
        continue;
      }
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into ophanim_schema_migrations (name, checksum) values ($1, $2)', [name, checksum]);
        await client.query('commit');
        console.log(`Applied ${name}`);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock(846151209)').catch(() => {});
    client.release();
  }
} finally {
  await pool.end();
}
