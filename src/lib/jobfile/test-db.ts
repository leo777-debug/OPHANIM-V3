// Test-only PostgreSQL fixture: The Panel's ledger migration plus the job-file
// migrations on PGlite, with the minimal tenant tables and functions they depend on.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const ORG_A = '00000000-0000-4000-8000-00000000000a', ORG_B = '00000000-0000-4000-8000-00000000000b';
export const USER_A = '00000000-0000-4000-8000-0000000000a1', USER_A2 = '00000000-0000-4000-8000-0000000000a2', USER_B = '00000000-0000-4000-8000-0000000000b1';

export async function jobFileDatabase() {
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create schema app_private;
    create table ophanim_organizations(id uuid primary key, name text); create table ophanim_users(id uuid primary key, display_name text, email text);
    create table ophanim_organization_memberships(organization_id uuid references ophanim_organizations(id), user_id uuid references ophanim_users(id), role text not null default 'owner', created_at timestamptz not null default now(), primary key (organization_id, user_id));
    create table ophanim_shipments(id uuid primary key default gen_random_uuid(), organization_id uuid not null references ophanim_organizations(id), shipment_reference text not null, booking_number text, container_number text, bill_of_lading_reference text,
      origin_port_name text, destination_port_name text, planned_departure_at timestamptz, planned_arrival_at timestamptz, metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique (organization_id, shipment_reference), unique (id, organization_id));
    create table ophanim_shipment_milestones(id uuid primary key default gen_random_uuid(), shipment_id uuid references ophanim_shipments(id));
    create table ophanim_intelligence_alerts(id uuid primary key default gen_random_uuid(), organization_id uuid not null, assessment_id uuid not null);
    create table ophanim_documents(id uuid primary key default gen_random_uuid(), organization_id uuid not null references ophanim_organizations(id), shipment_id uuid,
      document_type text not null default 'other', original_file_name text not null, storage_bucket text not null default 'ophanim-private', storage_path text not null,
      mime_type text not null, file_size_bytes bigint not null, file_sha256 text not null, status text not null default 'stored', created_by_user_id uuid,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table ophanim_audit_events(id uuid primary key default gen_random_uuid(), organization_id uuid not null, actor_user_id uuid, action text not null, subject_type text not null, subject_id uuid, metadata jsonb not null default '{}', created_at timestamptz not null default now());
    create table ophanim_events(id uuid primary key default gen_random_uuid(), organization_id uuid, event_type text not null default 'notice', category text not null default 'other', title text not null, description text,
      event_status text not null default 'active', occurred_at timestamptz, updated_at timestamptz not null default now(), geometry jsonb, attributes jsonb not null default '{}', metadata jsonb not null default '{}');
    create table ophanim_import_mapping_profiles(id uuid primary key default gen_random_uuid(), organization_id uuid not null, name text not null, entity_type text not null, delimiter text not null default ',', encoding text not null default 'utf-8',
      field_mapping jsonb not null default '{}', relationship_mapping jsonb not null default '{}', custom_field_mapping jsonb not null default '{}', created_by_user_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, name));
    create function app_private.is_organization_member(target uuid) returns boolean language sql stable as $$select target = nullif(current_setting('test.org', true), '')::uuid$$;
    create function app_private.current_ophanim_user_id() returns uuid language sql stable as $$select nullif(current_setting('test.user', true), '')::uuid$$;
    insert into ophanim_organizations values('${ORG_A}','Org A'),('${ORG_B}','Org B');
    insert into ophanim_users values('${USER_A}','A one'),('${USER_A2}','A two'),('${USER_B}','B one');
    insert into ophanim_organization_memberships(organization_id,user_id) values('${ORG_A}','${USER_A}'),('${ORG_A}','${USER_A2}'),('${ORG_B}','${USER_B}');`);
  await pg.exec(readFileSync('db/migrations/025_forecast_panel.sql', 'utf8'));
  await pg.exec(readFileSync('db/migrations/026_job_files.sql', 'utf8'));
  await pg.exec(readFileSync('supabase/migrations/20261022090000_job_files_security.sql', 'utf8'));
  // The Panel's own tenant RLS (20261021131245) needs Supabase storage; apply the read policies it would add.
  await pg.exec(`do $$ declare t text; begin foreach t in array array['ophanim_feature_snapshots','ophanim_forecast_questions','ophanim_forecasts','ophanim_forecast_outcomes','ophanim_forecast_scores'] loop
    execute format('alter table %I enable row level security',t); execute format('alter table %I force row level security',t);
    execute format('create policy forecast_tenant_read on %I for select to authenticated using(app_private.is_organization_member(organization_id))',t); end loop; end $$;`);
  return pg;
}
