alter table ophanim_entities alter column organization_id drop not null;
alter table ophanim_entities drop constraint if exists ophanim_entities_entity_type_check;
alter table ophanim_entities add column if not exists visibility text not null default 'organization_private' check (visibility in ('global', 'organization_private'));
alter table ophanim_entities add column if not exists confidence smallint check (confidence is null or confidence between 0 and 100);
alter table ophanim_entities add column if not exists first_seen_at timestamptz;
alter table ophanim_entities add column if not exists last_seen_at timestamptz;
alter table ophanim_entities add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table ophanim_entities add constraint ophanim_entities_visibility_owner_check check ((visibility = 'global' and organization_id is null) or (visibility = 'organization_private' and organization_id is not null));
create unique index if not exists ophanim_entities_global_key on ophanim_entities (entity_type, normalized_key) where organization_id is null;

create table if not exists ophanim_entity_type_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  type_key text not null check (type_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  label text not null check (char_length(trim(label)) between 1 and 120),
  description text,
  fields jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, type_key)
);

create table if not exists ophanim_entity_identifiers (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references ophanim_entities(id) on delete cascade,
  namespace text not null check (namespace ~ '^[a-z][a-z0-9_.-]{1,119}$'),
  identifier_value text not null check (char_length(trim(identifier_value)) between 1 and 1000),
  normalized_value text not null check (char_length(trim(normalized_value)) between 1 and 1000),
  source_id text references ophanim_sources(id) on delete set null,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  last_verified_at timestamptz,
  confidence smallint check (confidence is null or confidence between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (entity_id, namespace, normalized_value)
);
create index if not exists ophanim_entity_identifiers_lookup on ophanim_entity_identifiers (namespace, normalized_value);

create table if not exists ophanim_entity_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  from_entity_id uuid not null references ophanim_entities(id) on delete cascade,
  to_entity_id uuid not null references ophanim_entities(id) on delete cascade,
  relationship_type text not null check (char_length(trim(relationship_type)) between 1 and 120),
  confidence smallint check (confidence is null or confidence between 0 and 100),
  source_id text references ophanim_sources(id) on delete set null,
  valid_from timestamptz,
  valid_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_entity_id <> to_entity_id),
  unique nulls not distinct (organization_id, from_entity_id, to_entity_id, relationship_type)
);

create table if not exists ophanim_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  tag_key text not null check (tag_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
  label text not null,
  color text,
  unique nulls not distinct (organization_id, tag_key)
);

create table if not exists ophanim_entity_tags (
  entity_id uuid not null references ophanim_entities(id) on delete cascade,
  tag_id uuid not null references ophanim_tags(id) on delete cascade,
  primary key (entity_id, tag_id)
);

create table if not exists ophanim_entity_source_references (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references ophanim_entities(id) on delete cascade,
  source_id text references ophanim_sources(id) on delete set null,
  source_url text,
  provider_record_id text,
  retrieved_at timestamptz not null default now(),
  original_timestamp timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
