-- Organization-owned, sourced probability records. No automatic predictions.
create table if not exists public.ophanim_forecasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ophanim_organizations(id),
  created_by uuid not null references public.ophanim_users(id),
  question text not null check (length(question) between 10 and 500),
  horizon timestamptz not null,
  probability numeric(5,4) not null check (probability between 0 and 1),
  source_url text not null check (length(source_url) between 8 and 2000),
  rationale text not null default '' check (length(rationale) <= 4000),
  outcome boolean,
  outcome_source_url text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint forecast_resolution_complete check (
    (outcome is null and outcome_source_url is null and resolved_at is null)
    or (outcome is not null and outcome_source_url is not null and resolved_at is not null and resolved_at >= horizon)
  )
);
create index if not exists ophanim_forecasts_org_created_idx on public.ophanim_forecasts(organization_id,created_at desc,id);
alter table public.ophanim_forecasts enable row level security;
alter table public.ophanim_forecasts force row level security;
revoke all on public.ophanim_forecasts from public;
-- Browser roles receive no grants. Defense in depth for any future read grant.
create policy ophanim_forecasts_member_read on public.ophanim_forecasts for select
  using ((select app_private.is_organization_member(organization_id)));
-- Writes go through authenticated server routes with organization-scoped predicates.
-- No browser INSERT/UPDATE/DELETE policy or grants are added.
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then revoke all on public.ophanim_forecasts from anon; end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then revoke all on public.ophanim_forecasts from authenticated; end if;
end $$;
