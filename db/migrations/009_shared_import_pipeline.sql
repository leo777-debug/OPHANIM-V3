create table if not exists ophanim_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  import_type text not null check (import_type in ('shipment', 'cyber_client', 'cyber_asset', 'vendor_dependency')),
  file_name text not null check (char_length(trim(file_name)) between 1 and 255),
  file_size_bytes integer not null check (file_size_bytes between 1 and 5242880),
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  file_encoding text not null default 'utf-8',
  column_mapping jsonb not null,
  status text not null default 'previewed' check (status in ('previewed', 'queued', 'running', 'completed', 'failed', 'cancelled')),
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  summary jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ophanim_imports_organization_created on ophanim_imports (organization_id, created_at desc);
create index if not exists ophanim_imports_organization_status on ophanim_imports (organization_id, status, created_at desc);

create table if not exists ophanim_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references ophanim_imports(id) on delete cascade,
  row_number integer not null check (row_number > 1),
  raw_data jsonb not null,
  normalized_data jsonb,
  row_status text not null check (row_status in ('valid', 'invalid', 'duplicate_in_file', 'duplicate_existing', 'imported', 'failed')),
  errors jsonb not null default '[]'::jsonb,
  imported_entity_type text,
  imported_entity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_id, row_number)
);
create index if not exists ophanim_import_rows_pending on ophanim_import_rows (import_id, row_status, row_number);

create table if not exists ophanim_import_jobs (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null unique references ophanim_imports(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ophanim_import_jobs_pending on ophanim_import_jobs (status, next_attempt_at);
