alter table ophanim_users add column if not exists password_hash text;

create table if not exists ophanim_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ophanim_users(id) on delete cascade,
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ophanim_sessions_active_token on ophanim_sessions (token_hash, expires_at) where revoked_at is null;
