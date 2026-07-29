create table if not exists ophanim_watchlists (
  id uuid primary key default gen_random_uuid(), public_id uuid unique not null default gen_random_uuid(), owner_id uuid not null,
  entity_type text not null, entity_value text not null, label text, enabled boolean not null default true,
  last_snapshot jsonb, next_check_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists ophanim_watchlists_due on ophanim_watchlists (next_check_at) where enabled;
create table if not exists ophanim_email_subscriptions (
  id uuid primary key default gen_random_uuid(), watchlist_id uuid not null references ophanim_watchlists(id) on delete cascade,
  email text not null, mode text not null check (mode in ('immediate','digest')), digest_minutes integer not null default 30 check (digest_minutes in (30,60)),
  verified_at timestamptz, verification_token uuid unique default gen_random_uuid(), enabled boolean not null default true, next_digest_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists ophanim_notifications (
  id uuid primary key default gen_random_uuid(), watchlist_id uuid not null references ophanim_watchlists(id) on delete cascade,
  subscription_id uuid references ophanim_email_subscriptions(id) on delete cascade, kind text not null, payload jsonb not null,
  status text not null default 'pending', attempts integer not null default 0, resend_id text, idempotency_key uuid not null default gen_random_uuid(),
  next_attempt_at timestamptz not null default now(), error text, created_at timestamptz not null default now(), sent_at timestamptz
);
create index if not exists ophanim_notifications_due on ophanim_notifications (next_attempt_at) where status='pending';
create table if not exists ophanim_delivery_events (id uuid primary key default gen_random_uuid(), svix_id text unique not null, resend_id text, event_type text not null, payload jsonb not null, created_at timestamptz not null default now());
