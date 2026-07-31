create table if not exists ophanim_disruptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  source text not null check (char_length(trim(source)) between 1 and 160),
  source_reference text,
  title text not null check (char_length(trim(title)) between 1 and 300),
  disruption_type text not null check (disruption_type in ('port_closure', 'security', 'weather', 'cyber', 'infrastructure', 'labor', 'other')),
  severity smallint not null check (severity between 1 and 5),
  status text not null default 'active' check (status in ('monitoring', 'active', 'resolved')),
  description text,
  effective_at timestamptz,
  reported_at timestamptz,
  latitude double precision,
  longitude double precision,
  radius_km double precision,
  affected_ports jsonb not null default '[]'::jsonb,
  affected_vessels jsonb not null default '[]'::jsonb,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source, source_reference),
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180)),
  check (radius_km is null or radius_km > 0)
);
create index if not exists ophanim_disruptions_organization_active on ophanim_disruptions (organization_id, status, effective_at desc nulls last);

create table if not exists ophanim_disruption_evidence (
  id uuid primary key default gen_random_uuid(),
  disruption_id uuid not null references ophanim_disruptions(id) on delete cascade,
  source_name text not null check (char_length(trim(source_name)) between 1 and 160),
  title text not null check (char_length(trim(title)) between 1 and 300),
  source_url text not null,
  published_at timestamptz,
  excerpt text,
  captured_at timestamptz not null default now(),
  unique (disruption_id, source_url)
);
create index if not exists ophanim_disruption_evidence_disruption on ophanim_disruption_evidence (disruption_id, captured_at desc);

create table if not exists ophanim_shipment_impact_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  shipment_id uuid not null references ophanim_shipments(id) on delete cascade,
  disruption_id uuid not null references ophanim_disruptions(id) on delete cascade,
  impact_status text not null check (impact_status in ('monitoring', 'affected', 'cleared')),
  risk_level text not null check (risk_level in ('low', 'moderate', 'high', 'critical')),
  impact_score smallint not null check (impact_score between 0 and 100),
  confidence smallint not null check (confidence between 0 and 100),
  matched_signals jsonb not null default '[]'::jsonb,
  rationale jsonb not null default '{}'::jsonb,
  last_safe_move_at timestamptz,
  last_safe_move_source text,
  assessed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, shipment_id, disruption_id)
);
create index if not exists ophanim_shipment_impact_assessments_disruption on ophanim_shipment_impact_assessments (organization_id, disruption_id, impact_status, impact_score desc);
