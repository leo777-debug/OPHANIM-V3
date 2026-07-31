create table if not exists ophanim_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  asset_name text not null check (char_length(trim(asset_name)) between 1 and 240),
  asset_type text not null check (asset_type in ('server', 'workstation', 'network', 'cloud', 'application', 'identity', 'other')),
  environment text not null default 'production' check (environment in ('production', 'staging', 'development', 'other')),
  criticality smallint not null default 3 check (criticality between 1 and 5),
  owner_user_id uuid references ophanim_users(id) on delete set null,
  external_reference text,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, asset_name)
);
create index if not exists ophanim_assets_organization on ophanim_assets (organization_id, criticality desc, asset_name);

create table if not exists ophanim_zero_day_roll_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  cve_id text not null check (cve_id ~ '^CVE-[0-9]{4}-[0-9]{4,}$'),
  title text not null check (char_length(trim(title)) between 1 and 300),
  description text,
  cvss numeric(3,1) check (cvss is null or (cvss >= 0 and cvss <= 10)),
  known_exploited boolean not null default false,
  source_name text not null default 'operator',
  source_url text,
  due_at timestamptz,
  roll_call_status text not null default 'open' check (roll_call_status in ('open', 'triage', 'remediation', 'monitoring', 'closed')),
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, cve_id)
);
create index if not exists ophanim_zero_day_roll_calls_organization_status on ophanim_zero_day_roll_calls (organization_id, roll_call_status, due_at nulls last, updated_at desc);

create table if not exists ophanim_zero_day_asset_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  roll_call_id uuid not null references ophanim_zero_day_roll_calls(id) on delete cascade,
  asset_id uuid not null references ophanim_assets(id) on delete cascade,
  assessment_status text not null check (assessment_status in ('unknown', 'not_affected', 'affected', 'mitigated', 'remediated', 'accepted_risk')),
  owner_user_id uuid references ophanim_users(id) on delete set null,
  due_at timestamptz,
  notes text,
  assessed_by_user_id uuid references ophanim_users(id) on delete set null,
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, roll_call_id, asset_id)
);
create index if not exists ophanim_zero_day_asset_assessments_roll_call on ophanim_zero_day_asset_assessments (organization_id, roll_call_id, assessment_status);

create table if not exists ophanim_zero_day_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  roll_call_id uuid not null references ophanim_zero_day_roll_calls(id) on delete cascade,
  asset_assessment_id uuid references ophanim_zero_day_asset_assessments(id) on delete set null,
  decision text not null check (decision in ('approve', 'reject', 'accept_risk', 'note')),
  rationale text not null check (char_length(trim(rationale)) between 1 and 4000),
  recorded_by_user_id uuid references ophanim_users(id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index if not exists ophanim_zero_day_decisions_roll_call on ophanim_zero_day_decisions (roll_call_id, recorded_at desc);

create table if not exists ophanim_zero_day_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  roll_call_id uuid not null references ophanim_zero_day_roll_calls(id) on delete cascade,
  asset_assessment_id uuid references ophanim_zero_day_asset_assessments(id) on delete set null,
  evidence_type text not null check (evidence_type in ('advisory', 'scan', 'patch_note', 'change_record', 'approval', 'other')),
  title text not null check (char_length(trim(title)) between 1 and 300),
  source_url text not null,
  description text,
  captured_by_user_id uuid references ophanim_users(id) on delete set null,
  captured_at timestamptz not null default now()
);
create index if not exists ophanim_zero_day_evidence_roll_call on ophanim_zero_day_evidence (roll_call_id, captured_at desc);
