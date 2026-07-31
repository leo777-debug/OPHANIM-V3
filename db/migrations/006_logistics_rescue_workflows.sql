create table if not exists ophanim_rescue_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  shipment_id uuid not null references ophanim_shipments(id) on delete cascade,
  disruption_id uuid references ophanim_disruptions(id) on delete set null,
  impact_assessment_id uuid references ophanim_shipment_impact_assessments(id) on delete set null,
  case_status text not null default 'open' check (case_status in ('open', 'assessing', 'awaiting_approval', 'executing', 'recovered', 'closed')),
  objective text not null check (char_length(trim(objective)) between 1 and 1000),
  summary text,
  owner_user_id uuid references ophanim_users(id) on delete set null,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ophanim_rescue_cases_organization_active on ophanim_rescue_cases (organization_id, case_status, updated_at desc);
create index if not exists ophanim_rescue_cases_shipment on ophanim_rescue_cases (organization_id, shipment_id, created_at desc);

create table if not exists ophanim_rescue_actions (
  id uuid primary key default gen_random_uuid(),
  rescue_case_id uuid not null references ophanim_rescue_cases(id) on delete cascade,
  action_type text not null check (action_type in ('reroute', 'rebook', 'hold', 'carrier_contact', 'port_contact', 'customs', 'customer_update', 'procurement', 'other')),
  title text not null check (char_length(trim(title)) between 1 and 300),
  description text,
  action_status text not null default 'proposed' check (action_status in ('proposed', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled')),
  assigned_to_user_id uuid references ophanim_users(id) on delete set null,
  target_at timestamptz,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ophanim_rescue_actions_case_status on ophanim_rescue_actions (rescue_case_id, action_status, created_at desc);

create table if not exists ophanim_rescue_decisions (
  id uuid primary key default gen_random_uuid(),
  rescue_case_id uuid not null references ophanim_rescue_cases(id) on delete cascade,
  rescue_action_id uuid references ophanim_rescue_actions(id) on delete set null,
  decision text not null check (decision in ('approved', 'rejected', 'hold', 'note')),
  rationale text not null check (char_length(trim(rationale)) between 1 and 4000),
  recorded_by_user_id uuid references ophanim_users(id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index if not exists ophanim_rescue_decisions_case_recorded on ophanim_rescue_decisions (rescue_case_id, recorded_at desc);

create table if not exists ophanim_rescue_evidence (
  id uuid primary key default gen_random_uuid(),
  rescue_case_id uuid not null references ophanim_rescue_cases(id) on delete cascade,
  rescue_action_id uuid references ophanim_rescue_actions(id) on delete set null,
  evidence_type text not null check (evidence_type in ('source', 'carrier_notice', 'customer_notice', 'quote', 'approval', 'document', 'other')),
  title text not null check (char_length(trim(title)) between 1 and 300),
  source_url text not null,
  description text,
  captured_by_user_id uuid references ophanim_users(id) on delete set null,
  captured_at timestamptz not null default now()
);
create index if not exists ophanim_rescue_evidence_case_captured on ophanim_rescue_evidence (rescue_case_id, captured_at desc);
