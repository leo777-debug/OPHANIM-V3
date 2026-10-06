create table if not exists ophanim_import_mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 240),
  entity_type text not null,
  delimiter text not null default ',',
  encoding text not null default 'utf-8',
  field_mapping jsonb not null default '{}'::jsonb,
  relationship_mapping jsonb not null default '{}'::jsonb,
  custom_field_mapping jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists ophanim_import_artifacts (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references ophanim_imports(id) on delete cascade,
  storage_key text,
  content_type text,
  retention_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ophanim_entity_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  entity_type text not null,
  file_name text not null,
  file_size_bytes integer not null check (file_size_bytes > 0),
  file_sha256 text not null,
  file_encoding text not null,
  delimiter text not null,
  field_mapping jsonb not null default '{}'::jsonb,
  relationship_mapping jsonb not null default '{}'::jsonb,
  status text not null default 'previewed' check (status in ('previewed', 'queued', 'running', 'completed', 'failed', 'cancelled')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  imported_rows integer not null default 0,
  failed_rows integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ophanim_entity_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references ophanim_entity_imports(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  raw_data jsonb not null,
  normalized_data jsonb,
  row_status text not null check (row_status in ('valid', 'invalid', 'duplicate_in_file', 'duplicate_existing', 'imported', 'failed')),
  errors jsonb not null default '[]'::jsonb,
  entity_id uuid references ophanim_entities(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (import_id, row_number)
);
