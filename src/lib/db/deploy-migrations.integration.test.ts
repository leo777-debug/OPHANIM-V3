import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { applyPendingMigrations, migrationFiles } from '../../../db/deploy-migrations.mjs';

type MigrationFile = { directory: string; name: string };
const root = path.resolve(__dirname, '../../..');
const directories = [path.join(root, 'db/migrations'), path.join(root, 'supabase/migrations')];

// Mirrors production: the older migrations were applied outside the ledger
// (e.g. through the Supabase dashboard) and the newest ones are missing.
describe('deploy-time migrations', () => {
  it('applies only what is missing, tolerates out-of-ledger history and is idempotent', async () => {
    const db = new PGlite({ extensions: { pgcrypto, vector } });
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
      create table public.ophanim_schema_migrations(name text primary key,checksum text not null,applied_at timestamptz default now());`);
    const files: MigrationFile[] = await migrationFiles(directories);
    const older = files.filter(({ name }) => (/^\d{3}_/.test(name) && name < '024_verify') || name.startsWith('20260827') || name.startsWith('20261016'));
    for (const file of older) await db.exec(await readFile(path.join(file.directory, file.name), 'utf8'));

    const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55471, maxConnections: 5 });
    await server.start();
    try {
      const connectionString = 'postgresql://postgres:postgres@127.0.0.1:55471/postgres';
      const first = await applyPendingMigrations({ connectionString, directories, log: () => {} });
      expect(first.failed).toEqual([]);
      expect(first.applied).toEqual(expect.arrayContaining(['024_verify.sql', '025_forecast_panel.sql', '026_job_files.sql']));
      const second = await applyPendingMigrations({ connectionString, directories, log: () => {} });
      expect(second.applied).toEqual([]);
      expect(second.failed).toEqual([]);

      const state = await db.query<{ verify: string | null; forecasts: string | null; jobs: string | null; historical: number }>(
        `select to_regclass('public.ophanim_verify_runs')::text as verify, to_regclass('public.ophanim_forecasts')::text as forecasts,
          to_regclass('public.ophanim_job_files')::text as jobs,
          (select count(*)::int from information_schema.columns where table_name = 'ophanim_shipments' and column_name = 'historical') as historical`,
      );
      expect(state.rows[0]).toEqual({ verify: 'ophanim_verify_runs', forecasts: 'ophanim_forecasts', jobs: 'ophanim_job_files', historical: 1 });
    } finally {
      await server.stop();
      await db.close();
    }
  }, 240_000);
});
