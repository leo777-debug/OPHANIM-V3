import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationDirectories = [
  path.join(repositoryRoot, 'db', 'migrations'),
  path.join(repositoryRoot, 'supabase', 'migrations'),
];
const { Pool } = pg;

async function migrationFiles() {
  const files = [];
  for (const directory of migrationDirectories) {
    try {
      for (const name of await readdir(directory)) {
        if (/^(?:\d+_.+|\d{14}_.+)\.sql$/.test(name)) files.push({ directory, name });
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

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
    for (const { directory, name } of await migrationFiles()) {
      const sql = await readFile(path.join(directory, name), 'utf8');
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
