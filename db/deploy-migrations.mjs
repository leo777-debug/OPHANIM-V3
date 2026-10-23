// Applies pending migrations during Vercel production builds, using the
// DATABASE_URL Vercel already holds. Same files, order, ledger table and
// checksums as db/run-migrations.mjs, with two differences for unattended
// deploys:
//   - it never fails the build: a migration that errors is rolled back and
//     reported, and the deployment continues on the code's schema fallbacks;
//   - a migration whose objects already exist (applied outside the ledger,
//     e.g. through the Supabase dashboard) is skipped, not re-recorded.
// It does nothing outside production builds, because preview deployments
// share the production database.
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
// duplicate_table, duplicate_object, duplicate_column, duplicate_schema,
// duplicate_function, duplicate_database, duplicate_alias
const ALREADY_PRESENT = new Set(['42P07', '42710', '42701', '42P06', '42723', '42P04', '42712']);

export async function migrationFiles(directories = migrationDirectories) {
  const files = [];
  for (const directory of directories) {
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

function sslFor(connectionString) {
  try {
    const url = new URL(connectionString);
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.searchParams.get('sslmode') === 'disable') return undefined;
  } catch { /* pg reports invalid URLs itself */ }
  return { rejectUnauthorized: false };
}

/** Returns { applied, skipped, failed } names; never throws for a single migration. */
export async function applyPendingMigrations({ connectionString, directories, log = console.log }) {
  const summary = { applied: [], skipped: [], failed: [] };
  const pool = new pg.Pool({ connectionString, ssl: sslFor(connectionString), max: 1, application_name: 'ophanim-deploy-migrations' });
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock(846151209)');
    await client.query(`create table if not exists ophanim_schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )`);
    for (const { directory, name } of await migrationFiles(directories)) {
      const sql = await readFile(path.join(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query('select checksum from ophanim_schema_migrations where name = $1', [name]);
      if (applied.rowCount) {
        const crlf = createHash('sha256').update(sql.replace(/\r?\n/g, '\r\n')).digest('hex');
        if (applied.rows[0].checksum !== checksum && applied.rows[0].checksum !== crlf) log(`! ${name}: recorded checksum differs from this file; left as applied`);
        continue;
      }
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into ophanim_schema_migrations (name, checksum) values ($1, $2)', [name, checksum]);
        await client.query('commit');
        summary.applied.push(name);
        log(`+ applied ${name}`);
      } catch (error) {
        await client.query('rollback');
        if (ALREADY_PRESENT.has(error?.code)) {
          summary.skipped.push(name);
          log(`= ${name}: objects already present, skipped (${error.message})`);
        } else {
          summary.failed.push(name);
          log(`x ${name}: ${error?.code ?? ''} ${error?.message ?? error}`);
        }
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock(846151209)').catch(() => {});
    client.release();
    await pool.end();
  }
  return summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.env.VERCEL_ENV !== 'production') {
    console.log(`[migrations] skipped: VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'} (production builds only)`);
  } else if (!process.env.DATABASE_URL) {
    console.log('[migrations] skipped: DATABASE_URL is not available to this build');
  } else {
    try {
      const summary = await applyPendingMigrations({ connectionString: process.env.DATABASE_URL, log: (line) => console.log(`[migrations] ${line}`) });
      console.log(`[migrations] done: ${summary.applied.length} applied, ${summary.skipped.length} already present, ${summary.failed.length} failed`);
    } catch (error) {
      // Never block the deployment; the application degrades without the newest schema.
      console.log(`[migrations] could not run: ${error?.code ?? ''} ${error?.message ?? error}`);
    }
  }
}
