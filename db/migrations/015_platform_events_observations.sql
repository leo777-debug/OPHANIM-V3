create table if not exists ophanim_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  visibility text not null default 'organization_private' check (visibility in ('global', 'organization_private')),
  event_type text not null check (char_length(trim(event_type)) between 1 and 120),
  category text not null default 'other',
  title text not null check (char_length(trim(title)) between 1 and 1000),
  description text,
  event_status text not null default 'active' check (event_status in ('active', 'monitoring', 'resolved', 'cancelled', 'unknown')),
  occurred_at timestamptz,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  latitude double precision,
  longitude double precision,
  geometry jsonb,
  severity smallint check (severity is null or severity between 0 and 100),
  confidence smallint check (confidence is null or confidence between 0 and 100),
  deduplication_key text,
  attributes jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180)),
  check ((visibility = 'global' and organization_id is null) or (visibility = 'organization_private' and organization_id is not null))
);
create index if not exists ophanim_events_organization_recent on ophanim_events (organization_id, updated_at desc);
create unique index if not exists ophanim_events_global_deduplication on ophanim_events (event_type, deduplication_key) where organization_id is null and deduplication_key is not null;

create table if not exists ophanim_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  event_id uuid references ophanim_events(id) on delete set null,
  source_id text references ophanim_sources(id) on delete set null,
  provider_id text,
  provider_record_id text,
  source_url text,
  observed_at timestamptz,
  retrieved_at timestamptz not null default now(),
  content_hash text,
  payload jsonb not null default '{}'::jsonb,
  raw_reference jsonb not null default '{}'::jsonb,
  confidence smallint check (confidence is null or confidence between 0 and 100),
  unique nulls not distinct (organization_id, source_id, provider_record_id)
);
create index if not exists ophanim_observations_event on ophanim_observations (event_id, retrieved_at desc);

create table if not exists ophanim_event_entities (
  event_id uuid not null references ophanim_events(id) on delete cascade,
  entity_id uuid not null references ophanim_entities(id) on delete cascade,
  relationship_type text not null default 'related_to',
  confidence smallint check (confidence is null or confidence between 0 and 100),
  evidence jsonb not null default '{}'::jsonb,
  primary key (event_id, entity_id, relationship_type)
);

create table if not exists ophanim_event_sources (
  event_id uuid not null references ophanim_events(id) on delete cascade,
  source_id text not null references ophanim_sources(id) on delete restrict,
  observation_id uuid references ophanim_observations(id) on delete set null,
  primary key (event_id, source_id)
);

create table if not exists ophanim_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  event_id uuid references ophanim_events(id) on delete cascade,
  entity_id uuid references ophanim_entities(id) on delete cascade,
  assessment_type text not null,
  assessment_status text not null default 'calculated' check (assessment_status in ('calculated', 'analyst_verified', 'disputed', 'superseded')),
  confidence smallint check (confidence is null or confidence between 0 and 100),
  explanation jsonb not null default '{}'::jsonb,
  generated_by text not null default 'deterministic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
