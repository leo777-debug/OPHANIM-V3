-- Internal operational metadata only. Never store keys or organization records here.
create schema if not exists ophanim_runtime;
revoke all on schema ophanim_runtime from public;
create table if not exists ophanim_runtime.entries (
  scope text not null check (length(scope) between 1 and 80),
  id text not null check (length(id) between 1 and 240),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (scope, id)
);
alter table ophanim_runtime.entries enable row level security;
alter table ophanim_runtime.entries force row level security;
revoke all on ophanim_runtime.entries from public;
-- No browser policies: application access is through authenticated server routes.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema ophanim_runtime from anon;
    revoke all on ophanim_runtime.entries from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema ophanim_runtime from authenticated;
    revoke all on ophanim_runtime.entries from authenticated;
  end if;
end $$;
