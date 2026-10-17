create schema if not exists ophanim_private;
revoke all on schema ophanim_private from public;

create table ophanim_private.presentation_demo_access (
  id integer primary key check (id = 1),
  organization_id uuid not null references public.ophanim_organizations(id),
  user_id uuid not null references public.ophanim_users(id),
  enabled boolean not null default false,
  enabled_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > enabled_at and expires_at <= enabled_at + interval '24 hours')
);
alter table ophanim_private.presentation_demo_access enable row level security;
revoke all on ophanim_private.presentation_demo_access from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then
    revoke all on ophanim_private.presentation_demo_access from anon;
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    revoke all on ophanim_private.presentation_demo_access from authenticated;
  end if;
end $$;
