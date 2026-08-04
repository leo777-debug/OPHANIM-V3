alter table ophanim_dark_web_mentions add column if not exists confidence_score smallint check (confidence_score is null or confidence_score between 0 and 100);
alter table ophanim_dark_web_mentions add column if not exists confidence_level text check (confidence_level is null or confidence_level in ('high', 'medium', 'low', 'insufficient'));
alter table ophanim_dark_web_mentions add column if not exists confidence_breakdown jsonb not null default '{}'::jsonb;
alter table ophanim_rescue_cases add column if not exists signal_assessment_id uuid;

create table if not exists ophanim_signal_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  mention_id uuid not null references ophanim_dark_web_mentions(id) on delete cascade,
  entity_id uuid references ophanim_entities(id) on delete set null,
  subject_type text not null check (subject_type in ('shipment', 'cyber_client', 'cyber_asset', 'vendor_dependency')),
  subject_id uuid not null,
  subject_label text not null check (char_length(trim(subject_label)) between 1 and 300),
  assessment_status text not null default 'unverified_claim' check (assessment_status in ('unverified_claim', 'requires_verification', 'likely_relevant', 'confirmed_identity', 'cleared')),
  confidence_score smallint not null check (confidence_score between 0 and 100),
  confidence_level text not null check (confidence_level in ('high', 'medium', 'low', 'insufficient')),
  confidence_breakdown jsonb not null default '{}'::jsonb,
  correlation_signals jsonb not null default '[]'::jsonb,
  next_milestone_at timestamptz,
  last_safe_move_at timestamptz,
  last_safe_move_source text,
  owner_user_id uuid references ophanim_users(id) on delete set null,
  reviewed_by_user_id uuid references ophanim_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, mention_id, subject_type, subject_id)
);
create index if not exists ophanim_signal_assessments_queue on ophanim_signal_assessments (organization_id, assessment_status, confidence_score desc, updated_at desc);
create index if not exists ophanim_signal_assessments_subject on ophanim_signal_assessments (organization_id, subject_type, subject_id, updated_at desc);
do $$ begin
  alter table ophanim_rescue_cases add constraint ophanim_rescue_cases_signal_assessment_fk foreign key (signal_assessment_id) references ophanim_signal_assessments(id) on delete set null;
exception when duplicate_object then null;
end $$;

create table if not exists ophanim_intelligence_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  mention_id uuid not null unique references ophanim_dark_web_mentions(id) on delete cascade,
  review_status text not null default 'new' check (review_status in ('new', 'needs_triage', 'under_review', 'likely_relevant', 'false_positive', 'duplicate', 'escalated', 'monitoring', 'closed')),
  selected_entity_id uuid references ophanim_entities(id) on delete set null,
  selected_assessment_id uuid references ophanim_signal_assessments(id) on delete set null,
  duplicate_of_mention_id uuid references ophanim_dark_web_mentions(id) on delete set null,
  analyst_note text check (analyst_note is null or char_length(analyst_note) <= 4000),
  owner_user_id uuid references ophanim_users(id) on delete set null,
  reviewed_by_user_id uuid references ophanim_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ophanim_intelligence_reviews_queue on ophanim_intelligence_reviews (organization_id, review_status, updated_at desc);

create table if not exists ophanim_operational_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  workflow_type text not null check (workflow_type in ('shipment_exposure', 'cyber_exposure', 'rescue_case', 'roll_call')),
  workflow_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 300),
  task_status text not null default 'open' check (task_status in ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  assigned_to_user_id uuid references ophanim_users(id) on delete set null,
  due_at timestamptz,
  completion_note text check (completion_note is null or char_length(completion_note) <= 4000),
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ophanim_operational_tasks_due on ophanim_operational_tasks (organization_id, task_status, due_at nulls last, priority);

create table if not exists ophanim_remediation_rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  assessment_id uuid not null unique references ophanim_signal_assessments(id) on delete cascade,
  customer_id uuid references ophanim_customers(id) on delete set null,
  room_status text not null default 'open' check (room_status in ('open', 'verification', 'remediation', 'monitoring', 'closed')),
  title text not null check (char_length(trim(title)) between 1 and 300),
  summary text not null check (char_length(trim(summary)) between 1 and 4000),
  communication_draft text not null check (char_length(trim(communication_draft)) between 1 and 4000),
  owner_user_id uuid references ophanim_users(id) on delete set null,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ophanim_remediation_rooms_active on ophanim_remediation_rooms (organization_id, room_status, updated_at desc);

create table if not exists ophanim_intelligence_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  assessment_id uuid not null unique references ophanim_signal_assessments(id) on delete cascade,
  alert_category text not null check (alert_category in ('logistics', 'cyber')),
  title text not null check (char_length(trim(title)) between 1 and 300),
  summary text not null check (char_length(trim(summary)) between 1 and 2000),
  alert_status text not null default 'open' check (alert_status in ('open', 'acknowledged', 'muted', 'snoozed', 'closed')),
  snoozed_until timestamptz,
  acknowledged_by_user_id uuid references ophanim_users(id) on delete set null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ophanim_intelligence_alerts_active on ophanim_intelligence_alerts (organization_id, alert_status, updated_at desc);

create table if not exists ophanim_intelligence_notification_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  user_id uuid not null references ophanim_users(id) on delete cascade,
  email text not null,
  enabled boolean not null default false,
  mode text not null default 'immediate' check (mode in ('immediate', 'digest')),
  digest_minutes integer not null default 30 check (digest_minutes in (30, 60)),
  minimum_confidence smallint not null default 55 check (minimum_confidence between 0 and 100),
  next_digest_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists ophanim_intelligence_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  alert_id uuid not null references ophanim_intelligence_alerts(id) on delete cascade,
  setting_id uuid not null references ophanim_intelligence_notification_settings(id) on delete cascade,
  kind text not null check (kind in ('immediate', 'digest')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'suppressed')),
  attempts integer not null default 0 check (attempts >= 0),
  resend_id text,
  error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists ophanim_intelligence_deliveries_due on ophanim_intelligence_deliveries (next_attempt_at) where status = 'pending';
