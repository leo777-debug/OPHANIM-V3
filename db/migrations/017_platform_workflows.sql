create table if not exists ophanim_workflow_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references ophanim_organizations(id) on delete cascade,
  template_key text not null check (template_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
  name text not null check (char_length(trim(name)) between 1 and 240),
  description text,
  vertical text not null default 'general',
  allowed_entity_types jsonb not null default '[]'::jsonb,
  allowed_event_types jsonb not null default '[]'::jsonb,
  statuses jsonb not null default '["Open","Investigating","Waiting","Action Required","In Progress","Monitoring","Blocked","Resolved","Closed","Cancelled"]'::jsonb,
  task_templates jsonb not null default '[]'::jsonb,
  required_fields jsonb not null default '[]'::jsonb,
  default_deadline_hours integer check (default_deadline_hours is null or default_deadline_hours between 1 and 8760),
  escalation_rules jsonb not null default '[]'::jsonb,
  evidence_requirements jsonb not null default '[]'::jsonb,
  action_definitions jsonb not null default '[]'::jsonb,
  navigation_label text,
  terminology jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, template_key)
);

create table if not exists ophanim_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  workflow_template_id uuid references ophanim_workflow_templates(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 500),
  description text,
  case_status text not null default 'Open',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  owner_user_id uuid references ophanim_users(id) on delete set null,
  deadline_at timestamptz,
  outcome text,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists ophanim_cases_organization_open on ophanim_cases (organization_id, case_status, deadline_at nulls last, priority);

create table if not exists ophanim_case_entities (
  case_id uuid not null references ophanim_cases(id) on delete cascade,
  entity_id uuid not null references ophanim_entities(id) on delete cascade,
  primary key (case_id, entity_id)
);
create table if not exists ophanim_case_events (
  case_id uuid not null references ophanim_cases(id) on delete cascade,
  event_id uuid not null references ophanim_events(id) on delete cascade,
  primary key (case_id, event_id)
);
create table if not exists ophanim_case_collaborators (
  case_id uuid not null references ophanim_cases(id) on delete cascade,
  user_id uuid not null references ophanim_users(id) on delete cascade,
  role text not null default 'collaborator',
  primary key (case_id, user_id)
);
create table if not exists ophanim_case_contacts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references ophanim_cases(id) on delete cascade,
  name text not null,
  contact_type text,
  email text,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists ophanim_case_comments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references ophanim_cases(id) on delete cascade,
  author_user_id uuid references ophanim_users(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ophanim_case_tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references ophanim_cases(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 500),
  description text,
  task_status text not null default 'Open',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  assignee_user_id uuid references ophanim_users(id) on delete set null,
  due_at timestamptz,
  completion_note text,
  completed_at timestamptz,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ophanim_case_task_dependencies (
  task_id uuid not null references ophanim_case_tasks(id) on delete cascade,
  depends_on_task_id uuid not null references ophanim_case_tasks(id) on delete cascade,
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);
create table if not exists ophanim_case_activity (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references ophanim_cases(id) on delete cascade,
  actor_user_id uuid references ophanim_users(id) on delete set null,
  activity_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
