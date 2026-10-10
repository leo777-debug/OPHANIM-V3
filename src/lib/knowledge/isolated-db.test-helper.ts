import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { vector } from '@electric-sql/pglite-pgvector';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** Real PostgreSQL statements and policies, disposable in-memory database.
 * Supabase Auth/Storage tables are emulated; no production services are used.
 * This tests SQL isolation, not networking or concurrent worker scheduling. */
export async function createIsolatedClient() {
  const db = await PGlite.create({ extensions: { pgcrypto, vector } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets (id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated,service_role;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,service_role;
    create table ophanim_schema_migrations(name text primary key,checksum text not null,applied_at timestamptz default now());
  `);
  const files: {name: string; file: string}[] = [];
  for (const folder of ['db/migrations', 'supabase/migrations']) {
    for (const name of await readdir(folder)) if (name.endsWith('.sql')) files.push({ name, file: path.join(folder, name) });
  }
  for (const {name, file} of files.sort((a,b)=>a.name.localeCompare(b.name))) {
    try { await db.exec(`begin;\n${await readFile(file, 'utf8')}\ncommit;`); }
    catch(error) { await db.close(); throw new Error(`Isolated migration failed: ${name}`, {cause: error}); }
  }
  console.log(`Isolated PostgreSQL: all ${files.length} migrations applied, including pgcrypto and pgvector.`);
  return {
    connect: async () => {},
    query: async (sql: string, values?: unknown[]) => db.query<Record<string, string>>(sql, values),
    end: async () => db.close(),
  };
}
