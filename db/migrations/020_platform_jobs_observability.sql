create table if not exists ophanim_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  attempt integer not null default 1 check (attempt > 0),
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ophanim_job_runs_recent on ophanim_job_runs (job_key, created_at desc);

create table if not exists ophanim_provider_metric_samples (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  source_id text references ophanim_sources(id) on delete set null,
  sample_at timestamptz not null default now(),
  requests integer not null default 0,
  successes integer not null default 0,
  failures integer not null default 0,
  timeouts integer not null default 0,
  retries integer not null default 0,
  latency_ms integer,
  last_error text
);
create index if not exists ophanim_provider_metric_samples_recent on ophanim_provider_metric_samples (provider_id, sample_at desc);

create table if not exists ophanim_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  component text not null,
  status text not null check (status in ('healthy', 'degraded', 'unhealthy')),
  details jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);
create index if not exists ophanim_health_snapshots_component on ophanim_health_snapshots (component, captured_at desc);

create table if not exists ophanim_api_metric_samples (
  id uuid primary key default gen_random_uuid(),
  route_key text not null,
  status_code integer not null,
  duration_ms integer not null,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
