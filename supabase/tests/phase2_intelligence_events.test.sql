begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_column('public', 'ophanim_events', 'summary', 'events carry a normalized summary');
select has_column('public', 'ophanim_events', 'verification_state', 'events carry provider verification state');
select has_column('public', 'ophanim_events', 'primary_provider_id', 'events carry provider provenance');
select ok(
  (
    select bool_and(relrowsecurity)
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'ophanim_sources', 'ophanim_organization_provider_settings', 'ophanim_events',
        'ophanim_observations', 'ophanim_event_sources', 'ophanim_evidence', 'ophanim_evidence_links'
      )
  ),
  'Phase 2 intelligence tables have RLS enabled'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('40000000-0000-4000-8000-000000000004', 'phase2-a@ophanim.test', '{}'),
  ('50000000-0000-4000-8000-000000000005', 'phase2-b@ophanim.test', '{}');

insert into public.ophanim_users (id, auth_user_id, email, display_name)
values
  ('44000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', 'phase2-a@ophanim.test', 'Phase 2 A'),
  ('55000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', 'phase2-b@ophanim.test', 'Phase 2 B');

insert into public.ophanim_organizations (id, name, slug)
values
  ('c0000000-0000-4000-8000-000000000004', 'Phase 2 Tenant A', 'phase2-tenant-a'),
  ('d0000000-0000-4000-8000-000000000005', 'Phase 2 Tenant B', 'phase2-tenant-b');

insert into public.ophanim_organization_memberships (organization_id, user_id, role)
values
  ('c0000000-0000-4000-8000-000000000004', '44000000-0000-4000-8000-000000000004', 'owner'),
  ('d0000000-0000-4000-8000-000000000005', '55000000-0000-4000-8000-000000000005', 'owner');

insert into public.ophanim_events (id, organization_id, visibility, event_type, category, title, description, summary, verification_state, primary_provider_id)
values
  ('e0000000-0000-4000-8000-000000000001', null, 'global', 'earthquake', 'weather_disaster', 'Global event', 'Public authority event', 'Public authority event', 'confirmed', 'usgs-earthquakes'),
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000004', 'organization_private', 'port_notice', 'maritime_port', 'Tenant A event', 'Private customer event', 'Private customer event', 'unverified', 'official-port-notices'),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000005', 'organization_private', 'port_notice', 'maritime_port', 'Tenant B event', 'Private customer event', 'Private customer event', 'unverified', 'official-port-notices');

insert into public.ophanim_evidence (id, organization_id, evidence_type, provider_id, title, content_hash)
values ('f0000000-0000-4000-8000-000000000001', null, 'provider_record', 'usgs-earthquakes', 'Global evidence', repeat('a', 64));

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select title from public.ophanim_events order by title$$,
  $$values ('Global event'::text), ('Tenant A event'::text)$$,
  'Tenant A sees global intelligence and its own private events only'
);

select is(
  (select count(*)::integer from public.ophanim_events where organization_id = 'd0000000-0000-4000-8000-000000000005'),
  0,
  'Tenant A cannot read Tenant B events'
);

select throws_ok(
  $$insert into public.ophanim_events (visibility, event_type, category, title, summary, primary_provider_id) values ('global', 'forbidden', 'cyber_threat', 'Browser global write', 'Must be backend-only', 'cisa-kev')$$,
  '42501',
  'new row violates row-level security policy for table "ophanim_events"',
  'Authenticated browser clients cannot write global events'
);

select is((select count(*)::integer from public.ophanim_evidence), 1, 'Global evidence is readable by Tenant A');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select title from public.ophanim_events order by title$$,
  $$values ('Global event'::text), ('Tenant B event'::text)$$,
  'Tenant B sees global intelligence and its own private events only'
);

select is((select count(*)::integer from public.ophanim_evidence), 1, 'Global evidence is readable by Tenant B');

select throws_ok(
  $$insert into public.ophanim_organization_provider_settings (organization_id, provider_id) values ('c0000000-0000-4000-8000-000000000004', 'official-port-notices')$$,
  '42501',
  'new row violates row-level security policy for table "ophanim_organization_provider_settings"',
  'Tenant B cannot write Tenant A provider settings'
);

select is((select count(*)::integer from public.ophanim_organization_provider_settings), 0, 'Tenant B cannot create a Tenant A provider setting');

select * from finish();
rollback;
