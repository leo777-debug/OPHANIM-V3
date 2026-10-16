create table if not exists public.ophanim_verify_runs (
  id uuid primary key,
  organization_id uuid not null references public.ophanim_organizations(id) on delete cascade,
  user_id uuid not null references public.ophanim_users(id) on delete cascade,
  previous_id uuid,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  article_snapshot jsonb,
  checked_at timestamptz not null,
  unique (id, organization_id, user_id),
  foreign key (organization_id, user_id) references public.ophanim_organization_memberships(organization_id, user_id) on delete cascade,
  foreign key (previous_id, organization_id, user_id) references public.ophanim_verify_runs(id, organization_id, user_id)
);
create index if not exists ophanim_verify_runs_history on public.ophanim_verify_runs (organization_id, user_id, checked_at desc);
create table if not exists public.ophanim_verify_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ophanim_organizations(id) on delete cascade,
  user_id uuid not null references public.ophanim_users(id) on delete cascade,
  run_id uuid not null,
  token_hash text not null unique,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  expires_at timestamptz not null,
  foreign key (run_id, organization_id, user_id) references public.ophanim_verify_runs(id, organization_id, user_id) on delete cascade
);
alter table public.ophanim_verify_runs enable row level security;
alter table public.ophanim_verify_shares enable row level security;
-- Deny by default until the additive Supabase security migration is applied.
revoke all on public.ophanim_verify_runs, public.ophanim_verify_shares from public;
