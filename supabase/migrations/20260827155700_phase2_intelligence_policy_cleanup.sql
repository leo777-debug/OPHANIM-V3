-- Keep link-table reads separate from writes so the same request does not
-- evaluate multiple permissive policies for a single action.

drop policy if exists ophanim_event_sources_tenant_write on public.ophanim_event_sources;

drop policy if exists ophanim_event_sources_tenant_insert on public.ophanim_event_sources;
create policy ophanim_event_sources_tenant_insert on public.ophanim_event_sources
  for insert to authenticated
  with check (exists (
    select 1 from public.ophanim_events event
    where event.id = event_id
      and event.visibility = 'organization_private'
      and event.organization_id is not null
      and (select app_private.can_manage_organization(event.organization_id))
  ));

drop policy if exists ophanim_event_sources_tenant_update on public.ophanim_event_sources;
create policy ophanim_event_sources_tenant_update on public.ophanim_event_sources
  for update to authenticated
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

drop policy if exists ophanim_event_sources_tenant_delete on public.ophanim_event_sources;
create policy ophanim_event_sources_tenant_delete on public.ophanim_event_sources
  for delete to authenticated
  using (exists (
    select 1 from public.ophanim_events event
    where event.id = event_id
      and event.visibility = 'organization_private'
      and event.organization_id is not null
      and (select app_private.can_manage_organization(event.organization_id))
  ));

drop policy if exists ophanim_evidence_links_tenant_write on public.ophanim_evidence_links;

drop policy if exists ophanim_evidence_links_tenant_insert on public.ophanim_evidence_links;
create policy ophanim_evidence_links_tenant_insert on public.ophanim_evidence_links
  for insert to authenticated
  with check (exists (
    select 1 from public.ophanim_evidence evidence
    where evidence.id = evidence_id
      and evidence.organization_id is not null
      and (select app_private.can_manage_organization(evidence.organization_id))
  ));

drop policy if exists ophanim_evidence_links_tenant_update on public.ophanim_evidence_links;
create policy ophanim_evidence_links_tenant_update on public.ophanim_evidence_links
  for update to authenticated
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

drop policy if exists ophanim_evidence_links_tenant_delete on public.ophanim_evidence_links;
create policy ophanim_evidence_links_tenant_delete on public.ophanim_evidence_links
  for delete to authenticated
  using (exists (
    select 1 from public.ophanim_evidence evidence
    where evidence.id = evidence_id
      and evidence.organization_id is not null
      and (select app_private.can_manage_organization(evidence.organization_id))
  ));
