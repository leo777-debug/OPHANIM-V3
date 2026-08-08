create table if not exists ophanim_product_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  user_id uuid references ophanim_users(id) on delete set null,
  event_name text not null check (event_name ~ '^[a-z][a-z0-9_.-]{1,119}$'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ophanim_product_events_organization_recent on ophanim_product_events (organization_id, created_at desc);

create table if not exists ophanim_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  user_id uuid references ophanim_users(id) on delete cascade,
  email text,
  event_types jsonb not null default '[]'::jsonb,
  mode text not null default 'immediate' check (mode in ('immediate', 'digest')),
  digest_minutes integer not null default 30 check (digest_minutes in (30, 60, 360, 1440)),
  enabled boolean not null default true,
  next_digest_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ophanim_notification_preferences_recipient on ophanim_notification_preferences (organization_id, user_id, coalesce(email, ''));

create table if not exists ophanim_notification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  event_type text not null,
  title text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'acknowledged', 'cancelled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ophanim_notification_events_due on ophanim_notification_events (next_attempt_at) where status = 'pending';

create table if not exists ophanim_demo_scenarios (
  id uuid primary key default gen_random_uuid(),
  scenario_key text not null unique,
  name text not null,
  description text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ophanim_demo_organizations (
  organization_id uuid primary key references ophanim_organizations(id) on delete cascade,
  scenario_id uuid references ophanim_demo_scenarios(id) on delete set null,
  reset_at timestamptz,
  created_at timestamptz not null default now()
);
