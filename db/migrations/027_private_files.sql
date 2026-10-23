-- Private job-file bytes for installations with neither Supabase Storage nor a
-- storage directory (serverless hosts have no lasting filesystem). Same keys
-- as the bucket; reads still go through organization-checked signed routes.
create schema if not exists ophanim_private;
revoke all on schema ophanim_private from public;

create table ophanim_private.private_files (
  storage_key text primary key,
  mime_type text not null,
  byte_size integer not null check (byte_size between 1 and 10485760),
  bytes bytea not null,
  created_at timestamptz not null default now()
);
alter table ophanim_private.private_files enable row level security;
revoke all on ophanim_private.private_files from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then
    revoke all on ophanim_private.private_files from anon;
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    revoke all on ophanim_private.private_files from authenticated;
  end if;
end $$;
