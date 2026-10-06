create table if not exists ophanim_access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 3 and 254 and email like '%@%'),
  company_name text check (company_name is null or char_length(company_name) <= 160),
  phone text not null check (char_length(phone) between 5 and 40),
  source text not null default 'landing_page' check (char_length(source) <= 80),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists ophanim_access_requests_recent_idx on ophanim_access_requests (created_at desc);
create index if not exists ophanim_access_requests_email_idx on ophanim_access_requests (lower(email));

create table if not exists ophanim_feedback (
  id uuid primary key default gen_random_uuid(),
  name text check (name is null or char_length(name) <= 120),
  email text check (email is null or (char_length(email) <= 254 and email like '%@%')),
  message text not null check (char_length(message) between 3 and 3000),
  source text not null default 'landing_page' check (char_length(source) <= 80),
  status text not null default 'new' check (status in ('new', 'reviewed', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists ophanim_feedback_recent_idx on ophanim_feedback (created_at desc);
alter table ophanim_access_requests enable row level security;
alter table ophanim_feedback enable row level security;
revoke all on table ophanim_access_requests from anon, authenticated;
revoke all on table ophanim_feedback from anon, authenticated;
grant insert (name, email, company_name, phone, source) on table ophanim_access_requests to anon;
grant insert (name, email, message, source) on table ophanim_feedback to anon;

drop policy if exists "Public can submit access requests" on ophanim_access_requests;
create policy "Public can submit access requests" on ophanim_access_requests for insert to anon with check (
  status = 'new' and source = 'landing_page' and char_length(name) between 2 and 120
  and char_length(email) between 3 and 254 and email like '%@%' and char_length(phone) between 5 and 40
);

drop policy if exists "Public can submit feedback" on ophanim_feedback;
create policy "Public can submit feedback" on ophanim_feedback for insert to anon with check (
  status = 'new' and source = 'landing_page' and char_length(message) between 3 and 3000
);
