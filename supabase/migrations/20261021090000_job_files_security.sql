-- Job files, part 2: documents, extracted fields, the unified prediction ledger and RLS.
-- Runs after db/migrations/027_job_files.sql, phase-1 documents and parity forecasts.

-- Documents reuse the existing private table and bucket.
alter table public.ophanim_documents
  add column if not exists job_file_id uuid references public.ophanim_job_files(id) on delete set null,
  add column if not exists intake_item_id uuid references public.ophanim_intake_items(id) on delete set null,
  add column if not exists doc_type_code text,
  add column if not exists pages integer check (pages is null or pages between 1 and 200),
  add column if not exists received_via text check (received_via is null or received_via in ('email', 'whatsapp', 'photo', 'upload', 'generated', 'driver')),
  add column if not exists received_at timestamptz,
  add column if not exists original_created_at timestamptz,
  add column if not exists previous_version_id uuid references public.ophanim_documents(id) on delete set null,
  add column if not exists version_number integer not null default 1,
  add column if not exists reader text,
  add column if not exists classification_confidence numeric(4,3),
  add column if not exists text_content text;
create index if not exists ophanim_documents_job_idx on public.ophanim_documents (organization_id, job_file_id, created_at desc) where job_file_id is not null;

-- Phone photos are stored in the same private bucket.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set allowed_mime_types = (
      select array(select distinct unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'text/plain']::text[]))
    ) where id = 'ophanim-private';
  end if;
end $$;

create table if not exists public.ophanim_extracted_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ophanim_organizations(id) on delete cascade,
  document_id uuid not null references public.ophanim_documents(id) on delete cascade,
  job_file_id uuid references public.ophanim_job_files(id) on delete cascade,
  field text not null check (field ~ '^[a-z][a-z0-9_]{1,63}$'),
  value text,
  normalized_value text,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  page integer not null default 1 check (page >= 1),
  bbox jsonb check (bbox is null or (bbox ? 'x' and bbox ? 'y' and bbox ? 'w' and bbox ? 'h')),
  reader text not null,
  status text not null default 'suggested' check (status in ('suggested', 'auto_accepted', 'confirmed', 'corrected', 'rejected')),
  confirmed_by_user_id uuid references public.ophanim_users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, field)
);
create index if not exists ophanim_extracted_fields_job on public.ophanim_extracted_fields (organization_id, job_file_id, field);

-- ---------------------------------------------------------------------------
-- One prediction ledger. ophanim_forecasts (analyst probabilities) is extended,
-- not duplicated. Existing rows become source_type 'human'.
-- ---------------------------------------------------------------------------
create table if not exists public.ophanim_feature_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ophanim_organizations(id) on delete cascade,
  job_file_id uuid references public.ophanim_job_files(id) on delete cascade,
  shipment_id uuid references public.ophanim_shipments(id) on delete cascade,
  as_of timestamptz not null,
  feature_set_version text not null,
  features jsonb not null,
  inputs_hash text not null check (inputs_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create index if not exists ophanim_feature_snapshots_subject on public.ophanim_feature_snapshots (organization_id, job_file_id, shipment_id, as_of desc);

create table if not exists public.ophanim_forecast_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ophanim_organizations(id) on delete cascade,
  job_file_id uuid references public.ophanim_job_files(id) on delete cascade,
  shipment_id uuid references public.ophanim_shipments(id) on delete cascade,
  question_type text not null check (question_type in (
    'ghost_position', 'time_gap_risk', 'weather_impact', 'payment_date', 'dispute_odds', 'paper_risk',
    'arrives_by', 'clears_customs_by', 'delay_over_days', 'eta_distribution', 'sanctions_exposure', 'congestion_risk', 'demurrage_risk')),
  outcome_kind text not null check (outcome_kind in ('binary', 'interval', 'timestamp')),
  text_en text not null check (char_length(text_en) between 5 and 500),
  text_ar text,
  subject_key text not null,
  threshold jsonb not null default '{}'::jsonb,
  resolve_by timestamptz,
  status text not null default 'open' check (status in ('open', 'resolved', 'void')),
  created_at timestamptz not null default now(),
  unique (organization_id, subject_key)
);
create index if not exists ophanim_forecast_questions_open on public.ophanim_forecast_questions (organization_id, status, resolve_by);

alter table public.ophanim_forecasts
  add column if not exists question_id uuid references public.ophanim_forecast_questions(id) on delete cascade,
  add column if not exists job_file_id uuid references public.ophanim_job_files(id) on delete cascade,
  add column if not exists shipment_id uuid references public.ophanim_shipments(id) on delete cascade,
  add column if not exists source_type text not null default 'human',
  add column if not exists prediction_type text,
  add column if not exists prediction jsonb,
  add column if not exists p10_at timestamptz,
  add column if not exists p50_at timestamptz,
  add column if not exists p90_at timestamptz,
  add column if not exists base_rate numeric(5,4),
  add column if not exists drivers jsonb not null default '[]'::jsonb,
  add column if not exists rules_fired jsonb not null default '[]'::jsonb,
  add column if not exists analogs jsonb not null default '[]'::jsonb,
  add column if not exists inputs_hash text,
  add column if not exists feature_snapshot_id uuid references public.ophanim_feature_snapshots(id) on delete set null,
  add column if not exists model_version text,
  add column if not exists trigger text,
  add column if not exists issued_at timestamptz not null default now();
alter table public.ophanim_forecasts alter column created_by drop not null;
alter table public.ophanim_forecasts alter column source_url drop not null;
alter table public.ophanim_forecasts alter column probability drop not null;
do $$ begin
  alter table public.ophanim_forecasts add constraint ophanim_forecasts_source_type_check
    check (source_type in ('human', 'rule', 'logistic', 'ensemble', 'component_model', 'analog', 'base_rate', 'carrier_eta'));
exception when duplicate_object then null; end $$;
do $$ begin
  -- Human records keep every original requirement; machine records need a question, version and inputs hash.
  alter table public.ophanim_forecasts add constraint ophanim_forecasts_provenance_check check (
    (source_type = 'human' and created_by is not null and (question_id is not null or (source_url is not null and probability is not null)))
    or (source_type <> 'human' and question_id is not null and model_version is not null and inputs_hash ~ '^[a-f0-9]{64}$'
        and (probability is not null or prediction is not null))
  );
exception when duplicate_object then null; end $$;
create index if not exists ophanim_forecasts_question_idx on public.ophanim_forecasts (organization_id, question_id, issued_at desc);
create index if not exists ophanim_forecasts_job_idx on public.ophanim_forecasts (organization_id, job_file_id, issued_at desc) where job_file_id is not null;

-- Append-only: an update is a new row. The one exception is the original
-- one-time outcome on legacy analyst questions (no question_id), which the
-- Sourced forecasts API already enforces.
create or replace function app_private.ophanim_forecasts_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'ophanim_forecasts is append-only'; end if;
  if old.question_id is null and old.source_type = 'human' and old.outcome is null and new.outcome is not null
     and (to_jsonb(new) - array['outcome', 'outcome_source_url', 'resolved_at']) = (to_jsonb(old) - array['outcome', 'outcome_source_url', 'resolved_at']) then
    return new;
  end if;
  raise exception 'ophanim_forecasts is append-only; record a new forecast instead';
end $$;
drop trigger if exists ophanim_forecasts_append_only on public.ophanim_forecasts;
create trigger ophanim_forecasts_append_only before update or delete on public.ophanim_forecasts
  for each row execute function app_private.ophanim_forecasts_append_only();

create table if not exists public.ophanim_forecast_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ophanim_organizations(id) on delete cascade,
  forecast_id uuid not null references public.ophanim_forecasts(id) on delete cascade,
  kind text not null check (kind in ('shown', 'acted', 'dismissed')),
  action text,
  user_id uuid references public.ophanim_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ophanim_forecast_interactions_forecast on public.ophanim_forecast_interactions (organization_id, forecast_id);

create table if not exists public.ophanim_forecast_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ophanim_organizations(id) on delete cascade,
  question_id uuid not null unique references public.ophanim_forecast_questions(id) on delete cascade,
  outcome_bool boolean,
  outcome_at timestamptz,
  outcome_value numeric,
  resolved_at timestamptz not null default now(),
  resolution_source text not null check (resolution_source in ('milestone', 'shipment_event', 'actual_arrival', 'invoice_paid', 'query_received', 'weather_observed', 'delay_cost_invoice', 'manual')),
  reviewer_user_id uuid references public.ophanim_users(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  check (outcome_bool is not null or outcome_at is not null or outcome_value is not null),
  check (resolution_source <> 'manual' or reviewer_user_id is not null)
);

create table if not exists public.ophanim_forecast_scores (
  forecast_id uuid primary key references public.ophanim_forecasts(id) on delete cascade,
  organization_id uuid not null references public.ophanim_organizations(id) on delete cascade,
  question_type text not null,
  brier numeric(8,6),
  log_loss numeric(10,6),
  interval_hit boolean,
  abs_error_hours numeric(10,2),
  excluded_reason text check (excluded_reason is null or excluded_reason in ('intervention', 'void')),
  scored_at timestamptz not null default now()
);
create index if not exists ophanim_forecast_scores_type on public.ophanim_forecast_scores (organization_id, question_type, scored_at);

-- ---------------------------------------------------------------------------
-- RLS: enabled and forced, member read, no browser writes. Server routes write
-- with organization predicates, like ophanim_forecasts.
-- ---------------------------------------------------------------------------
do $$
declare target text;
begin
  foreach target in array array[
    'ophanim_counterparties', 'ophanim_job_files', 'ophanim_job_references', 'ophanim_job_legs', 'ophanim_job_milestones',
    'ophanim_job_piece_counts', 'ophanim_job_checks', 'ophanim_accepted_differences', 'ophanim_today_items', 'ophanim_driver_links',
    'ophanim_site_events', 'ophanim_invoices', 'ophanim_intake_items', 'ophanim_step_durations', 'ophanim_source_report_lags',
    'ophanim_paper_templates', 'ophanim_generated_papers', 'ophanim_extracted_fields', 'ophanim_feature_snapshots',
    'ophanim_forecast_questions', 'ophanim_forecast_interactions', 'ophanim_forecast_outcomes', 'ophanim_forecast_scores'
  ] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('revoke all on public.%I from public', target);
    execute format('drop policy if exists %I on public.%I', target || '_member_read', target);
    execute format('create policy %I on public.%I for select using ((select app_private.is_organization_member(organization_id)))', target || '_member_read', target);
  end loop;
  -- Shared reference rows (organization_id null) are readable by any signed-in member.
  foreach target in array array['ophanim_lessons', 'ophanim_sites', 'ophanim_document_types', 'ophanim_rule_packs', 'ophanim_milestone_templates', 'ophanim_city_pulse_events', 'ophanim_airport_weather'] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('revoke all on public.%I from public', target);
    execute format('drop policy if exists %I on public.%I', target || '_member_read', target);
    execute format('create policy %I on public.%I for select using (organization_id is null or (select app_private.is_organization_member(organization_id)))', target || '_member_read', target);
  end loop;
end $$;

-- Error statistics: only the person sees their own rows. Managers get team
-- totals by document type and step from a server aggregate, never a ranking.
alter table public.ophanim_staff_error_events enable row level security;
alter table public.ophanim_staff_error_events force row level security;
revoke all on public.ophanim_staff_error_events from public;
drop policy if exists ophanim_staff_error_events_self_read on public.ophanim_staff_error_events;
create policy ophanim_staff_error_events_self_read on public.ophanim_staff_error_events for select
  using (user_id = (select app_private.current_ophanim_user_id()) and (select app_private.is_organization_member(organization_id)));

do $$
declare target text;
begin
  foreach target in array array[
    'ophanim_counterparties', 'ophanim_job_files', 'ophanim_job_references', 'ophanim_job_legs', 'ophanim_job_milestones',
    'ophanim_job_piece_counts', 'ophanim_job_checks', 'ophanim_accepted_differences', 'ophanim_today_items', 'ophanim_driver_links',
    'ophanim_site_events', 'ophanim_invoices', 'ophanim_intake_items', 'ophanim_step_durations', 'ophanim_source_report_lags',
    'ophanim_paper_templates', 'ophanim_generated_papers', 'ophanim_extracted_fields', 'ophanim_feature_snapshots',
    'ophanim_forecast_questions', 'ophanim_forecast_interactions', 'ophanim_forecast_outcomes', 'ophanim_forecast_scores',
    'ophanim_lessons', 'ophanim_sites', 'ophanim_document_types', 'ophanim_rule_packs', 'ophanim_milestone_templates',
    'ophanim_city_pulse_events', 'ophanim_airport_weather', 'ophanim_staff_error_events'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on public.%I from anon', target); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on public.%I from authenticated', target); end if;
  end loop;
end $$;
