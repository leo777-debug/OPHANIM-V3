begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relname like 'ophanim\_%' escape '\'
      and not relation.relrowsecurity
  ),
  'RLS is enabled on every public Ophanim table'
);

select has_column('public', 'ophanim_shipments', 'organization_id', 'shipments carry a tenant key');
select has_column('public', 'ophanim_import_rows', 'organization_id', 'import rows carry a tenant key');
select has_column('public', 'ophanim_documents', 'organization_id', 'documents carry a tenant key');

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'owner-a@ophanim.test', '{}'),
  ('20000000-0000-4000-8000-000000000002', 'owner-b@ophanim.test', '{}'),
  ('30000000-0000-4000-8000-000000000003', 'viewer-a@ophanim.test', '{}');

insert into public.ophanim_users (id, auth_user_id, email, display_name)
values
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner-a@ophanim.test', 'Owner A'),
  ('22000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'owner-b@ophanim.test', 'Owner B'),
  ('33000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'viewer-a@ophanim.test', 'Viewer A');

insert into public.ophanim_organizations (id, name, slug)
values
  ('a0000000-0000-4000-8000-000000000001', 'Tenant A', 'phase1-tenant-a'),
  ('b0000000-0000-4000-8000-000000000002', 'Tenant B', 'phase1-tenant-b');

insert into public.ophanim_organization_memberships (organization_id, user_id, role)
values
  ('a0000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'owner'),
  ('a0000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000003', 'viewer'),
  ('b0000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', 'owner');

insert into public.ophanim_shipments (id, organization_id, shipment_reference)
values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'TENANT-A-SHIPMENT'),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'TENANT-B-SHIPMENT');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select shipment_reference from public.ophanim_shipments order by shipment_reference$$,
  $$values ('TENANT-A-SHIPMENT'::text)$$,
  'Tenant A owner can read only Tenant A shipments'
);

select throws_ok(
  $$insert into public.ophanim_shipments (organization_id, shipment_reference) values ('b0000000-0000-4000-8000-000000000002', 'CROSS-TENANT-INSERT')$$,
  '42501',
  'new row violates row-level security policy for table "ophanim_shipments"',
  'Tenant A owner cannot insert a Tenant B shipment'
);

select throws_ok(
  $$insert into public.ophanim_shipment_route_stops (organization_id, shipment_id, sequence_number, stop_type, port_name) values ('a0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 0, 'origin', 'Cross-tenant port')$$,
  '23503',
  'insert or update on table "ophanim_shipment_route_stops" violates foreign key constraint "ophanim_shipment_route_stops_shipment_tenant_fk"',
  'Tenant A child rows cannot reference Tenant B parents'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select count(*) from public.ophanim_shipments$$,
  array[1::bigint],
  'Tenant A viewer can read their organization shipments'
);

select throws_ok(
  $$insert into public.ophanim_shipments (organization_id, shipment_reference) values ('a0000000-0000-4000-8000-000000000001', 'VIEWER-WRITE')$$,
  '42501',
  'new row violates row-level security policy for table "ophanim_shipments"',
  'Viewer cannot create shipments'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select shipment_reference from public.ophanim_shipments order by shipment_reference$$,
  $$values ('TENANT-B-SHIPMENT'::text)$$,
  'Tenant B owner can read only Tenant B shipments'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'ophanim_private_objects_%'
  ),
  4,
  'Private storage has select, insert, update, and delete tenant policies'
);

select * from finish();
rollback;
