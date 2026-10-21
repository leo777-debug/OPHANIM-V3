// Test-only PostgreSQL fixture: the real job-file migrations on PGlite, with the
// minimal tenant tables and membership functions they depend on.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const ORG_A = '00000000-0000-4000-8000-00000000000a', ORG_B = '00000000-0000-4000-8000-00000000000b';
export const USER_A = '00000000-0000-4000-8000-0000000000a1', USER_A2 = '00000000-0000-4000-8000-0000000000a2', USER_B = '00000000-0000-4000-8000-0000000000b1';

export async function jobFileDatabase() {
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create schema app_private;
    create table ophanim_organizations(id uuid primary key, name text); create table ophanim_users(id uuid primary key, display_name text);
    create table ophanim_shipments(id uuid primary key default gen_random_uuid(), organization_id uuid);
    create table ophanim_documents(id uuid primary key default gen_random_uuid(), organization_id uuid not null references ophanim_organizations(id), shipment_id uuid,
      document_type text not null default 'other', original_file_name text not null, storage_bucket text not null default 'ophanim-private', storage_path text not null,
      mime_type text not null, file_size_bytes bigint not null, file_sha256 text not null, status text not null default 'stored', created_by_user_id uuid,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create function app_private.is_organization_member(target uuid) returns boolean language sql stable as $$select target = nullif(current_setting('test.org', true), '')::uuid$$;
    create function app_private.current_ophanim_user_id() returns uuid language sql stable as $$select nullif(current_setting('test.user', true), '')::uuid$$;
    insert into ophanim_organizations values('${ORG_A}','Org A'),('${ORG_B}','Org B');
    insert into ophanim_users values('${USER_A}','A one'),('${USER_A2}','A two'),('${USER_B}','B one');`);
  await pg.exec(readFileSync('supabase/migrations/20261020080311_parity_forecasts.sql', 'utf8'));
  await pg.exec(readFileSync('db/migrations/027_job_files.sql', 'utf8'));
  await pg.exec(readFileSync('supabase/migrations/20261021090000_job_files_security.sql', 'utf8'));
  return pg;
}
