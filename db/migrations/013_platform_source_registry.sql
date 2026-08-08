create table if not exists ophanim_sources (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{1,119}$'),
  name text not null check (char_length(trim(name)) between 1 and 240),
  category text not null default 'other',
  provider_id text,
  description text,
  source_url text,
  geographic_coverage text,
  authentication_required boolean not null default false,
  commercial_use text not null default 'unknown' check (commercial_use in ('allowed', 'review_required', 'restricted', 'unknown')),
  attribution text,
  redistribution_restrictions text,
  retention_hours integer check (retention_hours is null or retention_hours >= 0),
  refresh_frequency text,
  reliability_level text not null default 'unverified' check (reliability_level in ('primary_authority', 'direct_operator', 'original_source', 'trusted_news', 'osint', 'unverified')),
  enabled boolean not null default true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  owner_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ophanim_organization_provider_settings (
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  provider_id text not null,
  enabled boolean not null default true,
  credential_reference text,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider_id)
);

create index if not exists ophanim_sources_provider on ophanim_sources (provider_id, enabled);
