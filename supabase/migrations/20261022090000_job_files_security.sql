-- Job files, part 2: documents, extracted fields, job-file use of The Panel's ledger, and RLS.
-- Runs after db/migrations/025_forecast_panel.sql (the one prediction ledger),
-- db/migrations/026_job_files.sql and the phase-1 documents table.

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
-- One prediction ledger: The Panel's tables (025_forecast_panel.sql). Job-file
-- predictions are written there, linked to the job file's shipment row. Only
-- additive changes: more question types, a 'rule' source type for transparent
-- rule-based predictions, and a log of when a prediction was shown or acted on.
-- ---------------------------------------------------------------------------
alter table public.ophanim_forecast_questions drop constraint if exists ophanim_forecast_questions_question_type_check;
alter table public.ophanim_forecast_questions add constraint ophanim_forecast_questions_question_type_check check (question_type in
  ('arrives_by', 'clears_customs_by', 'delay_over_days', 'eta_distribution', 'sanctions_exposure', 'congestion', 'demurrage',
   'ghost_position', 'time_gap_risk', 'weather_impact', 'payment_date', 'dispute_odds', 'paper_risk'));
alter table public.ophanim_forecasts drop constraint if exists ophanim_forecasts_source_type_check;
alter table public.ophanim_forecasts add constraint ophanim_forecasts_source_type_check check (source_type in
  ('ensemble', 'component_model', 'analog', 'base_rate', 'carrier_eta', 'human', 'rule'));

-- Shown / acted / dismissed. The forecast row itself stays immutable; an acted-on
-- warning whose problem did not happen is recorded as outcomes.intervention.
create table if not exists public.ophanim_forecast_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ophanim_organizations(id) on delete cascade,
  forecast_id uuid not null,
  kind text not null check (kind in ('shown', 'acted', 'dismissed')),
  action text,
  user_id uuid references public.ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (forecast_id, organization_id) references public.ophanim_forecasts(id, organization_id)
);
create index if not exists ophanim_forecast_interactions_forecast on public.ophanim_forecast_interactions (organization_id, forecast_id);

-- ---------------------------------------------------------------------------
-- RLS: enabled and forced, member read, no browser writes. Server routes write
-- with organization predicates.
-- ---------------------------------------------------------------------------
do $$
declare target text;
begin
  foreach target in array array[
    'ophanim_counterparties', 'ophanim_job_files', 'ophanim_job_references', 'ophanim_job_legs', 'ophanim_job_milestones',
    'ophanim_job_piece_counts', 'ophanim_job_checks', 'ophanim_accepted_differences', 'ophanim_today_items', 'ophanim_driver_links',
    'ophanim_site_events', 'ophanim_invoices', 'ophanim_intake_items', 'ophanim_step_durations', 'ophanim_source_report_lags',
    'ophanim_paper_templates', 'ophanim_generated_papers', 'ophanim_extracted_fields', 'ophanim_forecast_interactions'
  ] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('revoke all on public.%I from public', target);
    execute format('drop policy if exists %I on public.%I', target || '_member_read', target);
    execute format('create policy %I on public.%I for select using ((select app_private.is_organization_member(organization_id)))', target || '_member_read', target);
  end loop;
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
    'ophanim_paper_templates', 'ophanim_generated_papers', 'ophanim_extracted_fields', 'ophanim_forecast_interactions',

    'ophanim_lessons', 'ophanim_sites', 'ophanim_document_types', 'ophanim_rule_packs', 'ophanim_milestone_templates',
    'ophanim_city_pulse_events', 'ophanim_airport_weather', 'ophanim_staff_error_events'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on public.%I from anon', target); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on public.%I from authenticated', target); end if;
  end loop;
end $$;
