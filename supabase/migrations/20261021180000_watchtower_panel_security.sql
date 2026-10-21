-- RLS for Watchtower and The Panel (tables in db/migrations/028_watchtower_panel.sql).

alter table public.ophanim_forecasts add column if not exists model_version_id uuid references public.ophanim_model_versions(id) on delete set null;
create index if not exists ophanim_forecasts_model_version_idx on public.ophanim_forecasts (model_version_id) where model_version_id is not null;

do $$
declare target text;
begin
  -- Tenant tables: member read only; writes go through the server or the forecast worker.
  foreach target in array array['ophanim_shipment_events', 'ophanim_forecast_score_rollups', 'ophanim_forecast_pooling_consent'] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('revoke all on public.%I from public', target);
    execute format('drop policy if exists %I on public.%I', target || '_member_read', target);
    execute format('create policy %I on public.%I for select using ((select app_private.is_organization_member(organization_id)))', target || '_member_read', target);
  end loop;
  -- Model registry: shared public-data models (organization_id null) are visible to members; tenant models only to their tenant.
  alter table public.ophanim_model_versions enable row level security;
  alter table public.ophanim_model_versions force row level security;
  revoke all on public.ophanim_model_versions from public;
  drop policy if exists ophanim_model_versions_member_read on public.ophanim_model_versions;
  create policy ophanim_model_versions_member_read on public.ophanim_model_versions for select using (organization_id is null or (select app_private.is_organization_member(organization_id)));
  -- Public data tables: server-side access only.
  foreach target in array array['ophanim_camera_feed_status', 'ophanim_public_history'] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('revoke all on public.%I from public', target);
  end loop;
  foreach target in array array['ophanim_shipment_events', 'ophanim_forecast_score_rollups', 'ophanim_forecast_pooling_consent', 'ophanim_model_versions', 'ophanim_camera_feed_status', 'ophanim_public_history'] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on public.%I from anon', target); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on public.%I from authenticated', target); end if;
  end loop;
end $$;

-- Receipts: aggregated track record only — no questions, shipments or job details.
-- security_invoker keeps the caller's RLS, so an organization sees only its own rollups.
create or replace view public.ophanim_receipts with (security_invoker = true) as
  select organization_id, question_type, source_type, model_version, month, sum(n) as n,
         round(sum(mean_brier * n) / nullif(sum(n) filter (where mean_brier is not null), 0), 6) as mean_brier,
         round(sum(interval_coverage * n) / nullif(sum(n) filter (where interval_coverage is not null), 0), 4) as interval_coverage
    from public.ophanim_forecast_score_rollups
   group by organization_id, question_type, source_type, model_version, month;
revoke all on public.ophanim_receipts from public;
