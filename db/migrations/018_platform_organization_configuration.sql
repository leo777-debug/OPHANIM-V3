create table if not exists ophanim_organization_configuration (
  organization_id uuid primary key references ophanim_organizations(id) on delete cascade,
  vertical text not null default 'general',
  capabilities jsonb not null default '{"map":true,"search":true,"workflows":true}'::jsonb,
  enabled_provider_ids jsonb not null default '[]'::jsonb,
  navigation jsonb not null default '[]'::jsonb,
  terminology jsonb not null default '{}'::jsonb,
  dashboard jsonb not null default '{}'::jsonb,
  analytics_enabled boolean not null default true,
  demo_mode_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ophanim_vertical_definitions (
  id uuid primary key default gen_random_uuid(),
  vertical_key text not null unique check (vertical_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
  name text not null,
  description text,
  entity_type_definitions jsonb not null default '[]'::jsonb,
  event_type_definitions jsonb not null default '[]'::jsonb,
  capability_defaults jsonb not null default '{}'::jsonb,
  navigation_defaults jsonb not null default '[]'::jsonb,
  terminology_defaults jsonb not null default '{}'::jsonb,
  dashboard_defaults jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
