-- Phase 2: normalized intelligence events, provenance, and tenant-safe access.

alter table public.ophanim_events
  add column if not exists summary text,
  add column if not exists expected_end_at timestamptz,
  add column if not exists verification_state text not null default 'unverified'
    check (verification_state in ('confirmed', 'likely', 'unverified', 'conflicting')),
  add column if not exists primary_provider_id text,
  add column if not exists source_count smallint not null default 0
    check (source_count >= 0),
  add column if not exists normalized_entities jsonb not null default '[]'::jsonb
    check (jsonb_typeof(normalized_entities) = 'array'),
  add column if not exists raw_evidence_refs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(raw_evidence_refs) = 'array');

update public.ophanim_events
set summary = coalesce(nullif(trim(description), ''), title)
where summary is null;

alter table public.ophanim_events alter column summary set not null;

create index if not exists ophanim_events_category_recent_idx
  on public.ophanim_events (category, updated_at desc);
create index if not exists ophanim_events_verification_recent_idx
  on public.ophanim_events (verification_state, updated_at desc);
create index if not exists ophanim_events_provider_recent_idx
  on public.ophanim_events (primary_provider_id, updated_at desc)
  where primary_provider_id is not null;
create unique index if not exists ophanim_events_tenant_deduplication_idx
  on public.ophanim_events (organization_id, event_type, deduplication_key)
  where organization_id is not null and deduplication_key is not null;

create unique index if not exists ophanim_evidence_global_provider_content_idx
  on public.ophanim_evidence (provider_id, content_hash)
  where organization_id is null and provider_id is not null and content_hash is not null;
create unique index if not exists ophanim_evidence_tenant_provider_content_idx
  on public.ophanim_evidence (organization_id, provider_id, content_hash)
  where organization_id is not null and provider_id is not null and content_hash is not null;

comment on column public.ophanim_events.verification_state is
  'Provider-level verification only. Correlation and analyst verification are later phases.';
comment on column public.ophanim_events.raw_evidence_refs is
  'References to immutable upstream records; credentials and private provider configuration are never stored here.';

alter table public.ophanim_sources enable row level security;
alter table public.ophanim_organization_provider_settings enable row level security;
alter table public.ophanim_events enable row level security;
alter table public.ophanim_observations enable row level security;
alter table public.ophanim_event_sources enable row level security;
alter table public.ophanim_evidence enable row level security;
alter table public.ophanim_evidence_links enable row level security;

revoke all on table
  public.ophanim_sources,
  public.ophanim_organization_provider_settings,
  public.ophanim_events,
  public.ophanim_observations,
  public.ophanim_event_sources,
  public.ophanim_evidence,
  public.ophanim_evidence_links
from anon, authenticated;

grant select on table
  public.ophanim_sources,
  public.ophanim_events,
  public.ophanim_observations,
  public.ophanim_event_sources,
  public.ophanim_evidence,
  public.ophanim_evidence_links
to authenticated;

grant select, insert, update, delete on table
  public.ophanim_organization_provider_settings,
  public.ophanim_events,
  public.ophanim_observations,
  public.ophanim_event_sources,
  public.ophanim_evidence,
  public.ophanim_evidence_links
to authenticated;

drop policy if exists ophanim_sources_authenticated_select on public.ophanim_sources;
create policy ophanim_sources_authenticated_select on public.ophanim_sources
  for select to authenticated using (true);

drop policy if exists ophanim_provider_settings_tenant_select on public.ophanim_organization_provider_settings;
create policy ophanim_provider_settings_tenant_select on public.ophanim_organization_provider_settings
  for select to authenticated
  using ((select app_private.is_organization_member(organization_id)));

drop policy if exists ophanim_provider_settings_tenant_insert on public.ophanim_organization_provider_settings;
create policy ophanim_provider_settings_tenant_insert on public.ophanim_organization_provider_settings
  for insert to authenticated
  with check ((select app_private.can_manage_organization(organization_id)));

drop policy if exists ophanim_provider_settings_tenant_update on public.ophanim_organization_provider_settings;
create policy ophanim_provider_settings_tenant_update on public.ophanim_organization_provider_settings
  for update to authenticated
  using ((select app_private.can_manage_organization(organization_id)))
  with check ((select app_private.can_manage_organization(organization_id)));

drop policy if exists ophanim_provider_settings_tenant_delete on public.ophanim_organization_provider_settings;
create policy ophanim_provider_settings_tenant_delete on public.ophanim_organization_provider_settings
  for delete to authenticated
  using ((select app_private.can_manage_organization(organization_id)));

drop policy if exists ophanim_events_tenant_select on public.ophanim_events;
create policy ophanim_events_tenant_select on public.ophanim_events
  for select to authenticated
  using (
    visibility = 'global'
    or (organization_id is not null and (select app_private.is_organization_member(organization_id)))
  );

drop policy if exists ophanim_events_tenant_insert on public.ophanim_events;
create policy ophanim_events_tenant_insert on public.ophanim_events
  for insert to authenticated
  with check (
    visibility = 'organization_private'
    and organization_id is not null
    and (select app_private.can_manage_organization(organization_id))
  );

drop policy if exists ophanim_events_tenant_update on public.ophanim_events;
create policy ophanim_events_tenant_update on public.ophanim_events
  for update to authenticated
  using (
    visibility = 'organization_private'
    and organization_id is not null
    and (select app_private.can_manage_organization(organization_id))
  )
  with check (
    visibility = 'organization_private'
    and organization_id is not null
    and (select app_private.can_manage_organization(organization_id))
  );

drop policy if exists ophanim_events_tenant_delete on public.ophanim_events;
create policy ophanim_events_tenant_delete on public.ophanim_events
  for delete to authenticated
  using (
    visibility = 'organization_private'
    and organization_id is not null
    and (select app_private.can_manage_organization(organization_id))
  );

drop policy if exists ophanim_observations_tenant_select on public.ophanim_observations;
create policy ophanim_observations_tenant_select on public.ophanim_observations
  for select to authenticated
  using (
    organization_id is null
    or (select app_private.is_organization_member(organization_id))
  );

drop policy if exists ophanim_observations_tenant_insert on public.ophanim_observations;
create policy ophanim_observations_tenant_insert on public.ophanim_observations
  for insert to authenticated
  with check (
    organization_id is not null
    and (select app_private.can_manage_organization(organization_id))
  );

drop policy if exists ophanim_observations_tenant_update on public.ophanim_observations;
create policy ophanim_observations_tenant_update on public.ophanim_observations
  for update to authenticated
  using (organization_id is not null and (select app_private.can_manage_organization(organization_id)))
  with check (organization_id is not null and (select app_private.can_manage_organization(organization_id)));

drop policy if exists ophanim_observations_tenant_delete on public.ophanim_observations;
create policy ophanim_observations_tenant_delete on public.ophanim_observations
  for delete to authenticated
  using (organization_id is not null and (select app_private.can_manage_organization(organization_id)));

drop policy if exists ophanim_event_sources_tenant_select on public.ophanim_event_sources;
create policy ophanim_event_sources_tenant_select on public.ophanim_event_sources
  for select to authenticated
  using (exists (
    select 1 from public.ophanim_events event
    where event.id = event_id
      and (
        event.visibility = 'global'
        or (event.organization_id is not null and (select app_private.is_organization_member(event.organization_id)))
      )
  ));

drop policy if exists ophanim_event_sources_tenant_write on public.ophanim_event_sources;
create policy ophanim_event_sources_tenant_write on public.ophanim_event_sources
  for all to authenticated
  using (exists (
    select 1 from public.ophanim_events event
    where event.id = event_id
      and event.visibility = 'organization_private'
      and event.organization_id is not null
      and (select app_private.can_manage_organization(event.organization_id))
  ))
  with check (exists (
    select 1 from public.ophanim_events event
    where event.id = event_id
      and event.visibility = 'organization_private'
      and event.organization_id is not null
      and (select app_private.can_manage_organization(event.organization_id))
  ));

drop policy if exists ophanim_evidence_tenant_select on public.ophanim_evidence;
create policy ophanim_evidence_tenant_select on public.ophanim_evidence
  for select to authenticated
  using (
    organization_id is null
    or (select app_private.is_organization_member(organization_id))
  );

drop policy if exists ophanim_evidence_tenant_insert on public.ophanim_evidence;
create policy ophanim_evidence_tenant_insert on public.ophanim_evidence
  for insert to authenticated
  with check (organization_id is not null and (select app_private.can_manage_organization(organization_id)));

drop policy if exists ophanim_evidence_tenant_update on public.ophanim_evidence;
create policy ophanim_evidence_tenant_update on public.ophanim_evidence
  for update to authenticated
  using (organization_id is not null and (select app_private.can_manage_organization(organization_id)))
  with check (organization_id is not null and (select app_private.can_manage_organization(organization_id)));

drop policy if exists ophanim_evidence_tenant_delete on public.ophanim_evidence;
create policy ophanim_evidence_tenant_delete on public.ophanim_evidence
  for delete to authenticated
  using (organization_id is not null and (select app_private.can_manage_organization(organization_id)));

drop policy if exists ophanim_evidence_links_tenant_select on public.ophanim_evidence_links;
create policy ophanim_evidence_links_tenant_select on public.ophanim_evidence_links
  for select to authenticated
  using (exists (
    select 1 from public.ophanim_evidence evidence
    where evidence.id = evidence_id
      and (
        evidence.organization_id is null
        or (select app_private.is_organization_member(evidence.organization_id))
      )
  ));

drop policy if exists ophanim_evidence_links_tenant_write on public.ophanim_evidence_links;
create policy ophanim_evidence_links_tenant_write on public.ophanim_evidence_links
  for all to authenticated
  using (exists (
    select 1 from public.ophanim_evidence evidence
    where evidence.id = evidence_id
      and evidence.organization_id is not null
      and (select app_private.can_manage_organization(evidence.organization_id))
  ))
  with check (exists (
    select 1 from public.ophanim_evidence evidence
    where evidence.id = evidence_id
      and evidence.organization_id is not null
      and (select app_private.can_manage_organization(evidence.organization_id))
  ));
