create extension if not exists pgcrypto;

do $$ begin
  create type ophanim_member_role as enum ('owner', 'operations_manager', 'analyst', 'viewer');
exception when duplicate_object then null;
end $$;

create table if not exists ophanim_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ophanim_users (
  id uuid primary key default gen_random_uuid(),
  external_subject text unique,
  email text unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ophanim_organization_memberships (
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  user_id uuid not null references ophanim_users(id) on delete cascade,
  role ophanim_member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists ophanim_memberships_user on ophanim_organization_memberships (user_id, organization_id);

create table if not exists ophanim_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 240),
  reference text,
  timezone text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference)
);
create index if not exists ophanim_customers_organization_active on ophanim_customers (organization_id, status, name);

create table if not exists ophanim_shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  customer_id uuid references ophanim_customers(id) on delete set null,
  shipment_reference text not null check (char_length(trim(shipment_reference)) between 1 and 160),
  booking_number text,
  container_number text,
  bill_of_lading_reference text,
  carrier text,
  vessel_name text,
  imo_number text check (imo_number is null or imo_number ~ '^\\d{7}$'),
  origin_port_name text,
  origin_port_code text,
  destination_port_name text,
  destination_port_code text,
  operational_timezone text not null default 'UTC',
  planned_departure_at timestamptz,
  planned_arrival_at timestamptz,
  actual_departure_at timestamptz,
  actual_arrival_at timestamptz,
  cargo_type text,
  priority smallint not null default 3 check (priority between 1 and 5),
  current_status text not null default 'planned' check (current_status in ('planned', 'booked', 'in_transit', 'at_port', 'delivered', 'cancelled', 'archived')),
  archived_at timestamptz,
  owner_user_id uuid references ophanim_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, shipment_reference)
);
create index if not exists ophanim_shipments_organization_active on ophanim_shipments (organization_id, current_status, planned_arrival_at) where archived_at is null;
create index if not exists ophanim_shipments_organization_vessel on ophanim_shipments (organization_id, imo_number, vessel_name) where archived_at is null;
create index if not exists ophanim_shipments_organization_ports on ophanim_shipments (organization_id, origin_port_code, destination_port_code) where archived_at is null;

create table if not exists ophanim_shipment_route_stops (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references ophanim_shipments(id) on delete cascade,
  sequence_number integer not null check (sequence_number >= 0),
  stop_type text not null check (stop_type in ('origin', 'transshipment', 'destination')),
  port_name text not null check (char_length(trim(port_name)) between 1 and 240),
  port_code text,
  latitude double precision,
  longitude double precision,
  planned_arrival_at timestamptz,
  planned_departure_at timestamptz,
  actual_arrival_at timestamptz,
  actual_departure_at timestamptz,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipment_id, sequence_number),
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);
create index if not exists ophanim_shipment_route_stops_port on ophanim_shipment_route_stops (port_code, planned_arrival_at);

create table if not exists ophanim_shipment_milestones (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references ophanim_shipments(id) on delete cascade,
  milestone_type text not null check (milestone_type in ('documentation_cutoff', 'cargo_cutoff', 'gate_in_cutoff', 'vessel_departure', 'customs_filing_deadline', 'transshipment_connection', 'carrier_amendment_deadline', 'warehouse_receiving_slot', 'truck_appointment', 'last_free_day', 'equipment_return_deadline', 'customer_delivery_commitment')),
  deadline_at timestamptz not null,
  timezone text,
  source_type text not null check (source_type in ('manual', 'import', 'integration')),
  source_reference text,
  confidence smallint not null default 100 check (confidence between 0 and 100),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled', 'superseded')),
  consequence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ophanim_shipment_milestones_due on ophanim_shipment_milestones (deadline_at) where status = 'active';

create table if not exists ophanim_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  actor_user_id uuid references ophanim_users(id) on delete set null,
  action text not null,
  subject_type text not null,
  subject_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ophanim_audit_events_subject on ophanim_audit_events (organization_id, subject_type, subject_id, created_at desc);
