create schema if not exists ophanim_private;
revoke all on schema ophanim_private from public;

create table public.ophanim_presentation_settings (
  id integer primary key check (id=1),
  presentation_mode boolean not null default false,
  presentation_default_view text not null default 'map' check (presentation_default_view in ('map','full')),
  presentation_replay text not null default 'auto' check (presentation_replay in ('auto','on','off')),
  presentation_verify_button boolean not null default false,
  pin_required boolean not null default false,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.ophanim_presentation_settings(id) values(1);
alter table public.ophanim_presentation_settings enable row level security;
revoke all on public.ophanim_presentation_settings from public;

create table public.ophanim_presentation_snapshots (
  feed_id text primary key check (feed_id in ('flights','maritime','earthquakes','fires','weather','satellites','cables','incidents','cyber','news','space-weather')),
  payload jsonb not null check (octet_length(payload::text)<=8388608),
  item_count integer not null check (item_count>=0),
  recorded_at timestamptz not null default now()
);
alter table public.ophanim_presentation_snapshots enable row level security;
revoke all on public.ophanim_presentation_snapshots from public;

create table ophanim_private.presentation_secrets (
  id integer primary key check (id=1),
  pin_hash text,
  pin_version integer not null default 0
);
insert into ophanim_private.presentation_secrets(id) values(1);
create table ophanim_private.presentation_view_grants (
  token_hash text primary key,
  pin_version integer not null,
  expires_at timestamptz not null
);
create index presentation_view_grants_expiry on ophanim_private.presentation_view_grants(expires_at);
create table ophanim_private.presentation_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.ophanim_users(id) on delete set null,
  organization_id uuid references public.ophanim_organizations(id) on delete set null,
  action text not null,
  old_value jsonb not null,
  new_value jsonb not null,
  changed_at timestamptz not null default now()
);
alter table ophanim_private.presentation_secrets enable row level security;
alter table ophanim_private.presentation_view_grants enable row level security;
alter table ophanim_private.presentation_audit enable row level security;
revoke all on all tables in schema ophanim_private from public;

-- Browser/Data API roles may only read the public flags and normalized public
-- snapshots. All writes go through the existing owner/admin API and transaction.
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then
    revoke all on all tables in schema ophanim_private from anon;
    grant select on public.ophanim_presentation_settings,public.ophanim_presentation_snapshots to anon;
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    revoke all on all tables in schema ophanim_private from authenticated;
    grant select on public.ophanim_presentation_settings,public.ophanim_presentation_snapshots to authenticated;
  end if;
end $$;
create policy presentation_flags_read on public.ophanim_presentation_settings for select using (true);
create policy presentation_snapshots_read on public.ophanim_presentation_snapshots for select using (true);
