create table if not exists ophanim_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('company', 'organization', 'domain', 'ip', 'location', 'country', 'region', 'shipment', 'vessel', 'port', 'terminal', 'subsea_cable', 'landing_station', 'carrier', 'client', 'asset', 'vendor', 'product', 'threat_actor', 'vulnerability', 'vendor_dependency')),
  canonical_name text not null check (char_length(trim(canonical_name)) between 1 and 500),
  normalized_key text not null check (char_length(normalized_key) between 1 and 600),
  attributes jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_type, normalized_key)
);
create index if not exists ophanim_entities_organization_type on ophanim_entities (organization_id, entity_type, canonical_name);

create table if not exists ophanim_entity_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references ophanim_entities(id) on delete cascade,
  alias text not null check (char_length(trim(alias)) between 1 and 500),
  normalized_alias text not null check (char_length(normalized_alias) between 1 and 600),
  identifier_type text,
  identifier_value text,
  source text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (entity_id, normalized_alias)
);
create index if not exists ophanim_entity_aliases_lookup on ophanim_entity_aliases (normalized_alias, identifier_type, identifier_value);

create table if not exists ophanim_dark_web_mentions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  provider_id text not null check (char_length(provider_id) between 1 and 120),
  provider_document_id text not null check (char_length(provider_document_id) between 1 and 500),
  source_category text not null check (source_category in ('licensed_intelligence', 'public_onion_index', 'ransomware_leak_feed', 'paste_feed', 'telegram_intelligence', 'defensive_threat_feed', 'development_fixture')),
  source_name text not null check (char_length(trim(source_name)) between 1 and 240),
  source_reference text check (source_reference is null or source_reference ~ '^https://'),
  published_at timestamptz,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  original_language text,
  original_text text not null check (char_length(original_text) <= 20000),
  translated_text text check (translated_text is null or char_length(translated_text) <= 20000),
  title text check (title is null or char_length(title) <= 1000),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  source_reliability smallint not null check (source_reliability between 0 and 100),
  processing_status text not null default 'processed' check (processing_status in ('new', 'processed', 'failed')),
  review_status text not null default 'new' check (review_status in ('new', 'needs_triage', 'under_review', 'likely_relevant', 'false_positive', 'duplicate', 'escalated', 'monitoring', 'closed')),
  threat_categories jsonb not null default '[]'::jsonb,
  duplicate_group_id uuid,
  source_chain_label text not null default 'relationship_unknown' check (source_chain_label in ('likely_original', 'likely_copy', 'possible_copy', 'independent_source', 'relationship_unknown')),
  independent_source_count integer not null default 0 check (independent_source_count >= 0),
  analyst_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider_id, provider_document_id)
);
create index if not exists ophanim_dark_web_mentions_organization_recent on ophanim_dark_web_mentions (organization_id, first_seen_at desc);
create index if not exists ophanim_dark_web_mentions_content_hash on ophanim_dark_web_mentions (organization_id, content_hash);

create table if not exists ophanim_mention_duplicate_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  anchor_mention_id uuid references ophanim_dark_web_mentions(id) on delete set null,
  relationship_label text not null check (relationship_label in ('likely_original', 'likely_copy', 'possible_copy', 'independent_source', 'relationship_unknown')),
  rationale jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ophanim_dark_web_mentions add constraint ophanim_dark_web_mentions_duplicate_group_fk foreign key (duplicate_group_id) references ophanim_mention_duplicate_groups(id) on delete set null;

create table if not exists ophanim_mention_entity_matches (
  id uuid primary key default gen_random_uuid(),
  mention_id uuid not null references ophanim_dark_web_mentions(id) on delete cascade,
  entity_id uuid not null references ophanim_entities(id) on delete cascade,
  match_method text not null check (match_method in ('exact_imo', 'exact_mmsi', 'exact_callsign', 'exact_unlocode', 'exact_domain', 'exact_ip', 'exact_client_identifier', 'exact_vendor_product', 'vessel_alias_owner', 'port_terminal', 'company_domain', 'product_dependency', 'name_context', 'weak_name')),
  matched_text text not null check (char_length(matched_text) <= 1000),
  identifier text,
  confidence_contribution smallint not null check (confidence_contribution between 0 and 100),
  ambiguous boolean not null default false,
  requires_review boolean not null default false,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (mention_id, entity_id, match_method, matched_text)
);
create index if not exists ophanim_mention_entity_matches_entity on ophanim_mention_entity_matches (entity_id, created_at desc);
