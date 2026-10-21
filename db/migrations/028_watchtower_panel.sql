-- Watchtower feed health (public data, shared across tenants) and The Panel's
-- training data, model registry and score rollups. The forecast ledger itself
-- (questions, forecasts, outcomes, scores, snapshots) was added by the job-file
-- migration on top of the existing ophanim_forecasts table; nothing is duplicated.

create table if not exists ophanim_camera_feed_status (
  feed_id text primary key check (char_length(feed_id) between 1 and 120),
  status text not null check (status in ('live', 'stale', 'dead', 'unverified', 'unknown')),
  last_seen timestamptz,
  last_checked timestamptz not null default now(),
  failures integer not null default 0 check (failures >= 0),
  detail text
);

-- Milestone gap: deadlines plus what actually happened, so delays become learnable.
alter table ophanim_shipment_milestones
  add column if not exists actual_at timestamptz,
  add column if not exists actual_source text check (actual_source is null or actual_source in ('ais', 'carrier', 'terminal', 'customs', 'trucker', 'email', 'document', 'manual', 'import', 'job_file'));

-- Timestamped facts with provenance (AIS arrival, berth, gate-out, customs release…).
create table if not exists ophanim_shipment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  shipment_id uuid not null references ophanim_shipments(id) on delete cascade,
  event_type text not null check (event_type in ('ais_arrival', 'ais_departure', 'berth', 'discharge', 'gate_in', 'gate_out', 'customs_release', 'delivery', 'other')),
  occurred_at timestamptz not null,
  source text not null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ophanim_shipment_events_shipment on ophanim_shipment_events (organization_id, shipment_id, occurred_at);

-- Imported history is marked so it is never mistaken for live operations.
alter table ophanim_shipments add column if not exists is_historical boolean not null default false;

-- Public reference history (shared; public data only, licence recorded per row).
create table if not exists ophanim_public_history (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  metric text not null,
  location_code text,
  observed_at timestamptz not null,
  value numeric not null,
  licence text not null,
  created_at timestamptz not null default now(),
  unique (source, metric, location_code, observed_at)
);

-- Model registry. organization_id null = trained only on public / opted-in pooled derived features.
create table if not exists ophanim_model_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  model_name text not null,
  version text not null,
  algorithm text not null,
  feature_set_version text not null,
  training_window jsonb not null default '{}'::jsonb,
  training_row_count integer not null default 0,
  training_data_hash text,
  artifact_uri text,
  artifact_sha256 text check (artifact_sha256 is null or artifact_sha256 ~ '^[a-f0-9]{64}$'),
  metrics jsonb not null default '{}'::jsonb,
  status text not null default 'candidate' check (status in ('candidate', 'active', 'retired')),
  trained_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, model_name, version)
);

-- Rollups power the Forecast Card track record, ensemble weights and the public Receipts view.
create table if not exists ophanim_forecast_score_rollups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  source_type text not null,
  model_version text not null,
  lane text not null default 'all',
  question_type text not null,
  month date not null,
  n integer not null,
  mean_brier numeric(8,6),
  mean_log_loss numeric(10,6),
  interval_coverage numeric(6,4),
  calibration_bins jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (organization_id, source_type, model_version, lane, question_type, month)
);

-- Pooling boundary: pooled training needs an explicit, recorded opt-in per organization.
create table if not exists ophanim_forecast_pooling_consent (
  organization_id uuid primary key references ophanim_organizations(id) on delete cascade,
  pooled_training boolean not null default false,
  derived_features_only boolean not null default true check (derived_features_only),
  decided_by_user_id uuid references ophanim_users(id) on delete set null,
  decided_at timestamptz not null default now()
);
