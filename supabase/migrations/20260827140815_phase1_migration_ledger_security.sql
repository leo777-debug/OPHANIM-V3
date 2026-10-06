alter table public.ophanim_schema_migrations enable row level security;
revoke all on table public.ophanim_schema_migrations from anon, authenticated;
