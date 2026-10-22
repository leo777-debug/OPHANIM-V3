-- Per-company embedding endpoint configuration. API keys remain environment-only.
create table public.ophanim_knowledge_settings (
  organization_id uuid primary key references public.ophanim_organizations(id) on delete cascade,
  embedding_base_url text not null,
  embedding_model text not null,
  updated_at timestamptz not null default now()
);
alter table public.ophanim_knowledge_settings enable row level security;
alter table public.ophanim_knowledge_settings force row level security;
