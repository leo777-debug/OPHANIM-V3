-- Phase 1: Supabase Auth linkage, tenant RLS, and private organization storage.

create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

alter table public.ophanim_users
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create index if not exists ophanim_users_auth_user_id_idx
  on public.ophanim_users (auth_user_id)
  where auth_user_id is not null;

update public.ophanim_users app_user
set auth_user_id = app_user.external_subject::uuid
where app_user.auth_user_id is null
  and app_user.external_subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1 from auth.users auth_user
    where auth_user.id = app_user.external_subject::uuid
  );

create or replace function app_private.current_ophanim_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select app_user.id
  from public.ophanim_users app_user
  where app_user.auth_user_id = (select auth.uid())
  limit 1
$$;

create or replace function app_private.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.ophanim_organization_memberships membership
    join public.ophanim_users app_user on app_user.id = membership.user_id
    where membership.organization_id = target_organization_id
      and app_user.auth_user_id = (select auth.uid())
  )
$$;

create or replace function app_private.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.ophanim_organization_memberships membership
    join public.ophanim_users app_user on app_user.id = membership.user_id
    where membership.organization_id = target_organization_id
      and app_user.auth_user_id = (select auth.uid())
      and membership.role in ('owner', 'operations_manager', 'analyst')
  )
$$;

create or replace function app_private.is_organization_owner(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.ophanim_organization_memberships membership
    join public.ophanim_users app_user on app_user.id = membership.user_id
    where membership.organization_id = target_organization_id
      and app_user.auth_user_id = (select auth.uid())
      and membership.role = 'owner'
  )
$$;

create or replace function app_private.storage_organization_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(object_name, '/', 1)::uuid
    else null
  end
$$;

revoke all on function app_private.current_ophanim_user_id() from public, anon;
revoke all on function app_private.is_organization_member(uuid) from public, anon;
revoke all on function app_private.can_manage_organization(uuid) from public, anon;
revoke all on function app_private.is_organization_owner(uuid) from public, anon;
revoke all on function app_private.storage_organization_id(text) from public, anon;
grant execute on function app_private.current_ophanim_user_id() to authenticated, service_role;
grant execute on function app_private.is_organization_member(uuid) to authenticated, service_role;
grant execute on function app_private.can_manage_organization(uuid) to authenticated, service_role;
grant execute on function app_private.is_organization_owner(uuid) to authenticated, service_role;
grant execute on function app_private.storage_organization_id(text) to authenticated, service_role;

-- Tenant keys are materialized on Phase 1 child records so every policy is local,
-- indexable, and independently testable.
alter table public.ophanim_shipment_route_stops add column if not exists organization_id uuid;
update public.ophanim_shipment_route_stops child
set organization_id = parent.organization_id
from public.ophanim_shipments parent
where child.shipment_id = parent.id and child.organization_id is null;
alter table public.ophanim_shipment_route_stops alter column organization_id set not null;
alter table public.ophanim_shipment_route_stops
  add constraint ophanim_shipment_route_stops_organization_fk
  foreign key (organization_id) references public.ophanim_organizations(id) on delete cascade;

alter table public.ophanim_shipment_milestones add column if not exists organization_id uuid;
update public.ophanim_shipment_milestones child
set organization_id = parent.organization_id
from public.ophanim_shipments parent
where child.shipment_id = parent.id and child.organization_id is null;
alter table public.ophanim_shipment_milestones alter column organization_id set not null;
alter table public.ophanim_shipment_milestones
  add constraint ophanim_shipment_milestones_organization_fk
  foreign key (organization_id) references public.ophanim_organizations(id) on delete cascade;

alter table public.ophanim_shipment_import_rows add column if not exists organization_id uuid;
update public.ophanim_shipment_import_rows child
set organization_id = parent.organization_id
from public.ophanim_shipment_imports parent
where child.shipment_import_id = parent.id and child.organization_id is null;
alter table public.ophanim_shipment_import_rows alter column organization_id set not null;
alter table public.ophanim_shipment_import_rows
  add constraint ophanim_shipment_import_rows_organization_fk
  foreign key (organization_id) references public.ophanim_organizations(id) on delete cascade;

alter table public.ophanim_import_rows add column if not exists organization_id uuid;
update public.ophanim_import_rows child
set organization_id = parent.organization_id
from public.ophanim_imports parent
where child.import_id = parent.id and child.organization_id is null;
alter table public.ophanim_import_rows alter column organization_id set not null;
alter table public.ophanim_import_rows
  add constraint ophanim_import_rows_organization_fk
  foreign key (organization_id) references public.ophanim_organizations(id) on delete cascade;

alter table public.ophanim_import_jobs add column if not exists organization_id uuid;
update public.ophanim_import_jobs child
set organization_id = parent.organization_id
from public.ophanim_imports parent
where child.import_id = parent.id and child.organization_id is null;
alter table public.ophanim_import_jobs alter column organization_id set not null;
alter table public.ophanim_import_jobs
  add constraint ophanim_import_jobs_organization_fk
  foreign key (organization_id) references public.ophanim_organizations(id) on delete cascade;

alter table public.ophanim_route_waypoints add column if not exists organization_id uuid;
update public.ophanim_route_waypoints child
set organization_id = parent.organization_id
from public.ophanim_routes parent
where child.route_id = parent.id and child.organization_id is null;
alter table public.ophanim_route_waypoints alter column organization_id set not null;
alter table public.ophanim_route_waypoints
  add constraint ophanim_route_waypoints_organization_fk
  foreign key (organization_id) references public.ophanim_organizations(id) on delete cascade;

create index if not exists ophanim_shipment_route_stops_organization_idx on public.ophanim_shipment_route_stops (organization_id, shipment_id);
create index if not exists ophanim_shipment_milestones_organization_idx on public.ophanim_shipment_milestones (organization_id, shipment_id, deadline_at);
create index if not exists ophanim_shipment_import_rows_organization_idx on public.ophanim_shipment_import_rows (organization_id, shipment_import_id);
create index if not exists ophanim_import_rows_organization_idx on public.ophanim_import_rows (organization_id, import_id, row_number);
create index if not exists ophanim_import_jobs_organization_idx on public.ophanim_import_jobs (organization_id, status, next_attempt_at);
create index if not exists ophanim_route_waypoints_organization_idx on public.ophanim_route_waypoints (organization_id, route_id, sequence_number);

create table if not exists public.ophanim_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ophanim_organizations(id) on delete cascade,
  shipment_id uuid references public.ophanim_shipments(id) on delete set null,
  document_type text not null default 'other' check (document_type in ('shipment_import', 'booking_confirmation', 'bill_of_lading', 'invoice', 'contract', 'email_attachment', 'other')),
  original_file_name text not null check (char_length(trim(original_file_name)) between 1 and 255),
  storage_bucket text not null default 'ophanim-private',
  storage_path text not null check (storage_path like organization_id::text || '/%'),
  mime_type text not null check (char_length(trim(mime_type)) between 1 and 160),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10485760),
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'stored' check (status in ('stored', 'processing', 'ready', 'rejected', 'deleted')),
  created_by_user_id uuid references public.ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, storage_path)
);

create index if not exists ophanim_documents_organization_created_idx
  on public.ophanim_documents (organization_id, created_at desc);
create index if not exists ophanim_documents_shipment_idx
  on public.ophanim_documents (organization_id, shipment_id, created_at desc)
  where shipment_id is not null and status <> 'deleted';

-- Every Ophanim table in the exposed public schema is deny-by-default. Only the
-- Phase 1 surfaces below receive authenticated grants and policies.
do $$
declare
  target record;
begin
  for target in
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public' and tablename like 'ophanim\_%' escape '\'
  loop
    execute format('alter table public.%I enable row level security', target.tablename);
    execute format('revoke all on table public.%I from anon, authenticated', target.tablename);
  end loop;
end
$$;

grant insert (name, email, company_name, phone, source) on table public.ophanim_access_requests to anon;
grant insert (name, email, message, source) on table public.ophanim_feedback to anon;

grant select, update on table public.ophanim_organizations to authenticated;
grant select, update on table public.ophanim_users to authenticated;
grant select, insert, update, delete on table public.ophanim_organization_memberships to authenticated;
grant select, insert, update, delete on table
  public.ophanim_customers,
  public.ophanim_shipments,
  public.ophanim_shipment_route_stops,
  public.ophanim_shipment_milestones,
  public.ophanim_shipment_imports,
  public.ophanim_shipment_import_rows,
  public.ophanim_imports,
  public.ophanim_import_rows,
  public.ophanim_import_jobs,
  public.ophanim_documents,
  public.ophanim_routes,
  public.ophanim_route_waypoints
to authenticated;
grant select, insert on table public.ophanim_audit_events to authenticated;

drop policy if exists ophanim_organizations_select on public.ophanim_organizations;
create policy ophanim_organizations_select on public.ophanim_organizations
  for select to authenticated
  using ((select app_private.is_organization_member(id)));

drop policy if exists ophanim_organizations_update on public.ophanim_organizations;
create policy ophanim_organizations_update on public.ophanim_organizations
  for update to authenticated
  using ((select app_private.is_organization_owner(id)))
  with check ((select app_private.is_organization_owner(id)));

drop policy if exists ophanim_users_select_self on public.ophanim_users;
create policy ophanim_users_select_self on public.ophanim_users
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

drop policy if exists ophanim_users_update_self on public.ophanim_users;
create policy ophanim_users_update_self on public.ophanim_users
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

drop policy if exists ophanim_memberships_select on public.ophanim_organization_memberships;
create policy ophanim_memberships_select on public.ophanim_organization_memberships
  for select to authenticated
  using ((select app_private.is_organization_member(organization_id)));

drop policy if exists ophanim_memberships_insert on public.ophanim_organization_memberships;
create policy ophanim_memberships_insert on public.ophanim_organization_memberships
  for insert to authenticated
  with check ((select app_private.is_organization_owner(organization_id)));

drop policy if exists ophanim_memberships_update on public.ophanim_organization_memberships;
create policy ophanim_memberships_update on public.ophanim_organization_memberships
  for update to authenticated
  using ((select app_private.is_organization_owner(organization_id)))
  with check ((select app_private.is_organization_owner(organization_id)));

drop policy if exists ophanim_memberships_delete on public.ophanim_organization_memberships;
create policy ophanim_memberships_delete on public.ophanim_organization_memberships
  for delete to authenticated
  using ((select app_private.is_organization_owner(organization_id)));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ophanim_customers',
    'ophanim_shipments',
    'ophanim_shipment_route_stops',
    'ophanim_shipment_milestones',
    'ophanim_shipment_imports',
    'ophanim_shipment_import_rows',
    'ophanim_imports',
    'ophanim_import_rows',
    'ophanim_import_jobs',
    'ophanim_documents',
    'ophanim_routes',
    'ophanim_route_waypoints'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_select', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select app_private.is_organization_member(organization_id)))',
      table_name || '_tenant_select', table_name
    );
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_insert', table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select app_private.can_manage_organization(organization_id)))',
      table_name || '_tenant_insert', table_name
    );
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_update', table_name);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select app_private.can_manage_organization(organization_id))) with check ((select app_private.can_manage_organization(organization_id)))',
      table_name || '_tenant_update', table_name
    );
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_delete', table_name);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select app_private.can_manage_organization(organization_id)))',
      table_name || '_tenant_delete', table_name
    );
  end loop;
end
$$;

drop policy if exists ophanim_audit_events_tenant_select on public.ophanim_audit_events;
create policy ophanim_audit_events_tenant_select on public.ophanim_audit_events
  for select to authenticated
  using ((select app_private.is_organization_member(organization_id)));

drop policy if exists ophanim_audit_events_tenant_insert on public.ophanim_audit_events;
create policy ophanim_audit_events_tenant_insert on public.ophanim_audit_events
  for insert to authenticated
  with check (
    (select app_private.can_manage_organization(organization_id))
    and actor_user_id = (select app_private.current_ophanim_user_id())
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ophanim-private',
  'ophanim-private',
  false,
  10485760,
  array[
    'text/csv',
    'application/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'message/rfc822',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ophanim_private_objects_select on storage.objects;
create policy ophanim_private_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ophanim-private'
    and (select app_private.is_organization_member(app_private.storage_organization_id(name)))
  );

drop policy if exists ophanim_private_objects_insert on storage.objects;
create policy ophanim_private_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ophanim-private'
    and (select app_private.can_manage_organization(app_private.storage_organization_id(name)))
  );

drop policy if exists ophanim_private_objects_update on storage.objects;
create policy ophanim_private_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'ophanim-private'
    and (select app_private.can_manage_organization(app_private.storage_organization_id(name)))
  )
  with check (
    bucket_id = 'ophanim-private'
    and (select app_private.can_manage_organization(app_private.storage_organization_id(name)))
  );

drop policy if exists ophanim_private_objects_delete on storage.objects;
create policy ophanim_private_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ophanim-private'
    and (select app_private.can_manage_organization(app_private.storage_organization_id(name)))
  );
