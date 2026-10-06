create table if not exists ophanim_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  shipment_id uuid references ophanim_shipments(id) on delete set null,
  vessel_entity_id uuid references ophanim_entities(id) on delete set null,
  route_name text check (route_name is null or char_length(trim(route_name)) between 1 and 240),
  vessel_name text,
  imo_number text check (imo_number is null or imo_number ~ '^\\d{7}$'),
  mmsi_number text check (mmsi_number is null or mmsi_number ~ '^\\d{9}$'),
  carrier text,
  cargo_type text,
  planned_departure_at timestamptz,
  planned_arrival_at timestamptz,
  actual_departure_at timestamptz,
  actual_arrival_at timestamptz,
  route_status text not null default 'draft' check (route_status in ('draft', 'ready', 'archived')),
  routing_provider_id text,
  route_geometry jsonb,
  route_distance_nm numeric,
  route_duration_minutes integer check (route_duration_minutes is null or route_duration_minutes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (planned_departure_at is null or planned_arrival_at is null or planned_arrival_at >= planned_departure_at),
  check (actual_departure_at is null or actual_arrival_at is null or actual_arrival_at >= actual_departure_at)
);
create index if not exists ophanim_routes_organization_active on ophanim_routes (organization_id, route_status, updated_at desc) where archived_at is null;
create index if not exists ophanim_routes_shipment on ophanim_routes (organization_id, shipment_id) where shipment_id is not null and archived_at is null;
create index if not exists ophanim_routes_vessel on ophanim_routes (organization_id, imo_number, mmsi_number, vessel_name) where archived_at is null;

create table if not exists ophanim_route_waypoints (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references ophanim_routes(id) on delete cascade,
  sequence_number integer not null check (sequence_number >= 0),
  waypoint_type text not null check (waypoint_type in ('origin', 'via', 'destination')),
  provider_id text not null check (provider_id ~ '^[a-zA-Z0-9_-]{2,120}$'),
  external_id text not null check (char_length(trim(external_id)) between 1 and 500),
  port_label text not null check (char_length(trim(port_label)) between 1 and 500),
  unlocode text check (unlocode is null or unlocode ~ '^[A-Z]{2}[A-Z0-9]{3}$'),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  metadata jsonb not null default '{}'::jsonb,
  selected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_id, sequence_number)
);
create unique index if not exists ophanim_route_waypoints_one_origin on ophanim_route_waypoints (route_id) where waypoint_type = 'origin';
create unique index if not exists ophanim_route_waypoints_one_destination on ophanim_route_waypoints (route_id) where waypoint_type = 'destination';
create index if not exists ophanim_route_waypoints_lookup on ophanim_route_waypoints (unlocode, country_code, port_label);
