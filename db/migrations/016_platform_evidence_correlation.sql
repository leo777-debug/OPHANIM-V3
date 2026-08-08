create table if not exists ophanim_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  evidence_type text not null check (char_length(trim(evidence_type)) between 1 and 120),
  verification_state text not null default 'source_record' check (verification_state in ('source_record', 'externally_reported', 'user_submitted', 'calculated', 'ai_generated', 'analyst_verified', 'disputed')),
  source_id text references ophanim_sources(id) on delete set null,
  provider_id text,
  title text not null check (char_length(trim(title)) between 1 and 1000),
  description text,
  source_url text,
  attachment_url text,
  content_hash text,
  retrieved_at timestamptz not null default now(),
  original_timestamp timestamptz,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ophanim_evidence_organization_recent on ophanim_evidence (organization_id, created_at desc);

create table if not exists ophanim_evidence_links (
  evidence_id uuid not null references ophanim_evidence(id) on delete cascade,
  resource_type text not null check (resource_type in ('entity', 'event', 'case', 'task', 'assessment')),
  resource_id uuid not null,
  primary key (evidence_id, resource_type, resource_id)
);

create table if not exists ophanim_correlations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  event_id uuid not null references ophanim_events(id) on delete cascade,
  entity_id uuid not null references ophanim_entities(id) on delete cascade,
  relationship_type text not null default 'likely_related',
  confidence smallint not null check (confidence between 0 and 100),
  signals jsonb not null default '[]'::jsonb,
  explanation text not null,
  status text not null default 'calculated' check (status in ('calculated', 'analyst_verified', 'disputed', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, entity_id, relationship_type)
);
create index if not exists ophanim_correlations_event on ophanim_correlations (event_id, confidence desc);
create index if not exists ophanim_correlations_entity on ophanim_correlations (entity_id, confidence desc);
