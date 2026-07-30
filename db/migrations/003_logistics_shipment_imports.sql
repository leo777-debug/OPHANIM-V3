create table if not exists ophanim_shipment_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  file_name text not null check (char_length(trim(file_name)) between 1 and 255),
  file_size_bytes integer not null check (file_size_bytes between 1 and 5242880),
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  column_mapping jsonb not null,
  status text not null default 'previewed' check (status in ('previewed', 'confirmed', 'failed', 'cancelled')),
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ophanim_shipment_imports_organization_created on ophanim_shipment_imports (organization_id, created_at desc);

create table if not exists ophanim_shipment_import_rows (
  id uuid primary key default gen_random_uuid(),
  shipment_import_id uuid not null references ophanim_shipment_imports(id) on delete cascade,
  row_number integer not null check (row_number > 1),
  raw_data jsonb not null,
  normalized_data jsonb,
  row_status text not null check (row_status in ('valid', 'invalid', 'duplicate_in_file', 'duplicate_existing', 'imported')),
  errors jsonb not null default '[]'::jsonb,
  imported_shipment_id uuid references ophanim_shipments(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (shipment_import_id, row_number)
);
create index if not exists ophanim_shipment_import_rows_pending on ophanim_shipment_import_rows (shipment_import_id, row_status);
