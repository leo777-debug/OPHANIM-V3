-- Job files: one file per shipment, built from paper, email, WhatsApp and other software.
-- Tenant rows carry organization_id. RLS is enabled and forced in
-- supabase/migrations/20261021090000_job_files_security.sql.

create table if not exists ophanim_counterparties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 240),
  normalized_name text not null,
  type text not null check (type in ('client', 'carrier', 'airline', 'agent', 'trucker', 'terminal', 'broker', 'other')),
  identifiers jsonb not null default '{}'::jsonb,
  email text,
  whatsapp text,
  created_at timestamptz not null default now(),
  unique (organization_id, type, normalized_name)
);

create table if not exists ophanim_job_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  shipment_id uuid references ophanim_shipments(id) on delete set null,
  job_number text not null check (char_length(trim(job_number)) between 1 and 64),
  mode text not null check (mode in ('air_export', 'air_import', 'sea_import', 'sea_export', 'road', 'multimodal')),
  status text not null default 'open' check (status in ('open', 'in_transit', 'arrived', 'cleared', 'delivered', 'closed', 'cancelled')),
  client_counterparty_id uuid references ophanim_counterparties(id) on delete set null,
  client_name text,
  origin text,
  destination text,
  planned_departure_at timestamptz,
  planned_arrival_at timestamptz,
  goods_description text,
  declared_value numeric(14,2),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  created_from text not null default 'manual' check (created_from in ('manual', 'email', 'photo', 'whatsapp', 'import', 'api', 'demo')),
  is_synthetic boolean not null default false,
  assigned_user_id uuid references ophanim_users(id) on delete set null,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, job_number)
);
create index if not exists ophanim_job_files_org_status on ophanim_job_files (organization_id, status, planned_arrival_at);

-- The key ring: every reference number points back to its job.
create table if not exists ophanim_job_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  job_file_id uuid not null references ophanim_job_files(id) on delete cascade,
  type text not null check (type in ('awb', 'hawb', 'bl', 'hbl', 'container', 'booking', 'invoice', 'customs_dec', 'delivery_order', 'client_ref', 'other')),
  value text not null check (char_length(value) between 1 and 80),
  normalized_value text not null,
  validated boolean not null default false,
  validation_code text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (organization_id, job_file_id, type, normalized_value)
);
create index if not exists ophanim_job_references_lookup on ophanim_job_references (organization_id, normalized_value);

create table if not exists ophanim_job_legs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  job_file_id uuid not null references ophanim_job_files(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  mode text not null check (mode in ('air', 'sea', 'road', 'rail')),
  from_location text,
  to_location text,
  carrier text,
  transport_ref text,
  planned_departure_at timestamptz,
  planned_arrival_at timestamptz,
  unique (job_file_id, sequence)
);

create table if not exists ophanim_job_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  job_file_id uuid not null references ophanim_job_files(id) on delete cascade,
  leg_id uuid references ophanim_job_legs(id) on delete set null,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  sequence integer not null default 0,
  planned_at timestamptz,
  expected_at timestamptz,
  actual_at timestamptz,
  source text check (source is null or source in ('email', 'document', 'floor_tap', 'driver', 'api', 'manual', 'import')),
  source_key text,
  reported_at timestamptz,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  evidence_document_id uuid,
  evidence_text text,
  needs_confirmation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_file_id, code)
);

create table if not exists ophanim_job_piece_counts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  job_file_id uuid not null references ophanim_job_files(id) on delete cascade,
  handoff text not null check (handoff in ('booked', 'received', 'manifested', 'landed', 'terminal_received', 'warehouse_tally', 'delivered')),
  pieces integer not null check (pieces >= 0),
  weight_kg numeric(12,2) check (weight_kg is null or weight_kg >= 0),
  source text not null default 'manual',
  document_id uuid,
  photo_document_id uuid,
  recorded_by_user_id uuid references ophanim_users(id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index if not exists ophanim_job_piece_counts_job on ophanim_job_piece_counts (organization_id, job_file_id, recorded_at);

-- Flags raised by deterministic checks, with bilingual message, reason and fix.
create table if not exists ophanim_job_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  job_file_id uuid references ophanim_job_files(id) on delete cascade,
  document_ids uuid[] not null default '{}',
  check_code text not null,
  severity text not null check (severity in ('info', 'warn', 'block')),
  message_en text not null, message_ar text not null,
  why_en text not null, why_ar text not null,
  fix_en text not null, fix_ar text not null,
  details jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  status text not null default 'open' check (status in ('open', 'fixed', 'accepted_difference', 'false_alarm')),
  raised_for_user_id uuid references ophanim_users(id) on delete set null,
  resolved_by_user_id uuid references ophanim_users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, fingerprint)
);
create index if not exists ophanim_job_checks_open on ophanim_job_checks (organization_id, status, severity);

-- "Remembered differences": an accepted difference for a client is not flagged again.
create table if not exists ophanim_accepted_differences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  counterparty_key text not null,
  check_code text not null,
  value_a text not null,
  value_b text not null,
  accepted_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, counterparty_key, check_code, value_a, value_b)
);

create table if not exists ophanim_lessons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  check_code text not null,
  lesson_en text not null, lesson_ar text not null,
  example_en text not null default '', example_ar text not null default '',
  unique nulls not distinct (organization_id, check_code)
);

-- Staff error statistics are private to the person (see security migration).
create table if not exists ophanim_staff_error_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  user_id uuid not null references ophanim_users(id) on delete cascade,
  document_type text not null,
  process_step text not null,
  check_code text,
  is_error boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists ophanim_staff_error_events_user on ophanim_staff_error_events (organization_id, user_id, created_at desc);

create table if not exists ophanim_today_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  job_file_id uuid references ophanim_job_files(id) on delete cascade,
  kind text not null check (kind in ('flag', 'missing_milestone', 'confirm_document', 'review_request', 'chaser', 'deadline', 'intake_review')),
  title_en text not null, title_ar text not null,
  probability numeric(5,4) check (probability is null or probability between 0 and 1),
  cost numeric(12,2),
  priority numeric(14,4) not null default 0,
  due_at timestamptz,
  assignee_user_id uuid references ophanim_users(id) on delete set null,
  team text,
  state text not null default 'open' check (state in ('open', 'done', 'snoozed', 'escalated', 'not_a_problem')),
  snoozed_until timestamptz,
  interrupt boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  source_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_key)
);
create index if not exists ophanim_today_items_open on ophanim_today_items (organization_id, state, priority desc);

-- Gates, terminals, warehouses, borders, ports and airports. Null organization = shared reference.
create table if not exists ophanim_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  type text not null check (type in ('gate', 'terminal', 'warehouse', 'border', 'port', 'airport')),
  code text,
  name text not null,
  emirate text,
  latitude double precision, longitude double precision,
  created_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);

create table if not exists ophanim_driver_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  job_file_id uuid not null references ophanim_job_files(id) on delete cascade,
  leg_id uuid references ophanim_job_legs(id) on delete set null,
  site_id uuid references ophanim_sites(id) on delete set null,
  token_sha256 text not null unique check (token_sha256 ~ '^[a-f0-9]{64}$'),
  driver_label text,
  location_opt_in boolean not null default false,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists ophanim_site_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  site_id uuid references ophanim_sites(id) on delete set null,
  job_file_id uuid references ophanim_job_files(id) on delete cascade,
  driver_link_id uuid references ophanim_driver_links(id) on delete set null,
  event text not null check (event in ('arrived', 'loaded', 'left')),
  at timestamptz not null default now(),
  -- Stored only when the driver opted in for this trip.
  latitude double precision, longitude double precision,
  photo_document_id uuid,
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);
create index if not exists ophanim_site_events_site on ophanim_site_events (site_id, at);

create table if not exists ophanim_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  job_file_id uuid references ophanim_job_files(id) on delete set null,
  direction text not null check (direction in ('outgoing', 'incoming')),
  counterparty_id uuid references ophanim_counterparties(id) on delete set null,
  counterparty_name text,
  invoice_number text,
  lines jsonb not null default '[]'::jsonb,
  subtotal numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  quote_total numeric(14,2),
  delay_cost_kind text check (delay_cost_kind is null or delay_cost_kind in ('storage', 'demurrage', 'detention')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'paid', 'disputed', 'void')),
  einvoice_status text not null default 'not_submitted' check (einvoice_status in ('not_submitted', 'stub_exported', 'submitted', 'accepted', 'rejected')),
  issued_at timestamptz, due_at timestamptz, paid_at timestamptz, disputed_at timestamptz,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ophanim_invoices_job on ophanim_invoices (organization_id, job_file_id);

-- Email, WhatsApp, phone-photo and upload intake before matching.
create table if not exists ophanim_intake_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'photo', 'upload')),
  external_id text,
  sender text,
  subject text,
  body_text text,
  received_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'matched', 'review', 'created_job', 'ignored')),
  matched_job_file_id uuid references ophanim_job_files(id) on delete set null,
  references_found jsonb not null default '[]'::jsonb,
  match_candidates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique nulls distinct (organization_id, channel, external_id)
);
create index if not exists ophanim_intake_items_status on ophanim_intake_items (organization_id, status, received_at desc);

-- Configuration that can change without code: document types, rule packs,
-- milestone templates, step durations, report lags, templates, City Pulse.
create table if not exists ophanim_document_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  label_en text not null, label_ar text not null,
  fields jsonb not null default '[]'::jsonb,
  keywords jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  unique nulls not distinct (organization_id, code)
);

create table if not exists ophanim_rule_packs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  name text not null,
  mode text,
  destination_pattern text,
  goods_pattern text,
  required_documents jsonb not null default '[]'::jsonb,
  active boolean not null default true
);

create table if not exists ophanim_milestone_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  mode text not null,
  steps jsonb not null,
  version integer not null default 1,
  unique nulls not distinct (organization_id, mode, version)
);

create table if not exists ophanim_step_durations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  mode text not null,
  from_code text not null,
  to_code text not null,
  p10_hours numeric(8,2) not null, p50_hours numeric(8,2) not null, p90_hours numeric(8,2) not null,
  grace_hours numeric(8,2) not null default 1,
  sample_count integer not null default 0,
  source text not null default 'default' check (source in ('default', 'history')),
  updated_at timestamptz not null default now(),
  unique (organization_id, mode, from_code, to_code)
);

-- How late each source usually reports a milestone, compared with the real event (Ghost Position).
create table if not exists ophanim_source_report_lags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  source_key text not null,
  milestone_code text not null,
  lag_samples_hours jsonb not null default '[]'::jsonb,
  reports_milestone boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (organization_id, source_key, milestone_code)
);

create table if not exists ophanim_paper_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  kind text not null check (kind in ('house_awb', 'delivery_note', 'client_invoice')),
  name text not null,
  layout jsonb not null default '{}'::jsonb,
  logo_storage_path text check (logo_storage_path is null or logo_storage_path like organization_id::text || '/%'),
  updated_at timestamptz not null default now(),
  unique (organization_id, kind)
);

create table if not exists ophanim_generated_papers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  job_file_id uuid not null references ophanim_job_files(id) on delete cascade,
  kind text not null check (kind in ('house_awb', 'delivery_note', 'client_invoice')),
  version integer not null check (version >= 1),
  data jsonb not null,
  storage_path text check (storage_path is null or storage_path like organization_id::text || '/%'),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by_user_id uuid references ophanim_users(id) on delete set null,
  approved_at timestamptz,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (job_file_id, kind, version)
);

create table if not exists ophanim_city_pulse_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  emirate text not null,
  kind text not null check (kind in ('truck_curfew', 'road_rule', 'event', 'closure', 'holiday')),
  title_en text not null, title_ar text not null,
  starts_at timestamptz, ends_at timestamptz,
  weekly jsonb,
  applies_to text not null default 'truck' check (applies_to in ('truck', 'all')),
  source_url text,
  is_synthetic boolean not null default false
);

-- Airport weather reports. Public data is shared (organization_id null); customer feeds stay private.
create table if not exists ophanim_airport_weather (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  station text not null check (station ~ '^[A-Z]{4}$'),
  kind text not null check (kind in ('metar', 'taf')),
  raw text not null,
  issued_at timestamptz not null,
  valid_from timestamptz, valid_to timestamptz,
  source text not null,
  is_synthetic boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ophanim_airport_weather_station on ophanim_airport_weather (station, kind, issued_at desc);
