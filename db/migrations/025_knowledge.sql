-- Additive RAG schema. pgvector must be available on the PostgreSQL host.
-- Supabase may already have vector installed in extensions rather than public.
set local search_path = public, extensions;
create extension if not exists vector;

create table public.ophanim_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.ophanim_organizations(id) on delete cascade,
  scope_key uuid generated always as (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  created_by_user_id uuid references public.ophanim_users(id) on delete set null,
  shipment_id uuid references public.ophanim_shipments(id) on delete set null,
  file_name text not null check (char_length(file_name) between 1 and 255),
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10485760),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  document_type text not null default 'other',
  language text not null default 'und',
  published_at timestamptz, valid_from timestamptz, valid_to timestamptz,
  metadata jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','processing','ready','failed','deleting')),
  progress integer not null default 0 check (progress between 0 and 100),
  error text,
  ingested_at timestamptz,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  check (organization_id is null or storage_path like organization_id::text || '/%'),
  check (organization_id is not null or (
    coalesce(metadata->>'commercial_use' = 'true',false) and coalesce(metadata->>'customer_data' = 'false',false)
    and nullif(metadata->>'licence','') is not null and lower(metadata->>'licence') <> 'unknown'
    and nullif(metadata->>'licence_url','') is not null and nullif(metadata->>'source_url','') is not null
  )),
  unique (scope_key, content_hash), unique (id, scope_key)
);
create table public.ophanim_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.ophanim_organizations(id) on delete cascade,
  scope_key uuid generated always as (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  document_id uuid not null,
  ordinal integer not null,
  content text not null check (char_length(content) between 1 and 12000),
  content_hash text not null,
  source_file text not null,
  reference jsonb not null default '{}',
  document_type text not null,
  language text not null,
  published_at timestamptz, valid_from timestamptz, valid_to timestamptz,
  ingested_at timestamptz not null default now(),
  search_vector tsvector generated always as (to_tsvector('simple', content)) stored,
  foreign key (document_id, scope_key) references public.ophanim_knowledge_documents(id, scope_key) on delete cascade,
  unique (document_id, ordinal), unique (id, scope_key)
);
create table public.ophanim_knowledge_embeddings (
  chunk_id uuid primary key,
  organization_id uuid references public.ophanim_organizations(id) on delete cascade,
  scope_key uuid generated always as (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  model text not null,
  embedding vector(1024) not null,
  foreign key (chunk_id, scope_key) references public.ophanim_knowledge_chunks(id, scope_key) on delete cascade
);
create table public.ophanim_knowledge_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.ophanim_organizations(id) on delete cascade,
  scope_key uuid generated always as (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  document_id uuid not null,
  kind text not null default 'ingest' check (kind in ('ingest','delete')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  foreign key (document_id, scope_key) references public.ophanim_knowledge_documents(id, scope_key) on delete cascade,
  unique (document_id, kind)
);
create index knowledge_documents_scope on public.ophanim_knowledge_documents(organization_id, created_at desc);
create index knowledge_chunks_scope on public.ophanim_knowledge_chunks(organization_id, document_id);
create index knowledge_chunks_fts on public.ophanim_knowledge_chunks using gin(search_vector);
create index knowledge_embeddings_scope on public.ophanim_knowledge_embeddings(organization_id, model);
create index knowledge_embeddings_hnsw on public.ophanim_knowledge_embeddings using hnsw(embedding vector_cosine_ops);
create index knowledge_jobs_pending on public.ophanim_knowledge_jobs(next_attempt_at, created_at) where status in ('queued','running');
alter table public.ophanim_knowledge_documents enable row level security;
alter table public.ophanim_knowledge_chunks enable row level security;
alter table public.ophanim_knowledge_embeddings enable row level security;
alter table public.ophanim_knowledge_jobs enable row level security;
alter table public.ophanim_knowledge_documents force row level security;
alter table public.ophanim_knowledge_chunks force row level security;
alter table public.ophanim_knowledge_embeddings force row level security;
alter table public.ophanim_knowledge_jobs force row level security;
