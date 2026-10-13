-- Restricted backend roles: requests never search through a service-role pool.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'ophanim_knowledge_app') then
    create role ophanim_knowledge_app nologin nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'ophanim_knowledge_worker') then
    create role ophanim_knowledge_worker nologin nobypassrls;
  end if;
end $$;
grant ophanim_knowledge_app, ophanim_knowledge_worker to current_user;
grant usage on schema public, app_private to ophanim_knowledge_app, ophanim_knowledge_worker;
do $$ begin
  if exists (select 1 from pg_namespace where nspname='extensions') then
    grant usage on schema extensions to ophanim_knowledge_app, ophanim_knowledge_worker;
  end if;
end $$;

-- The backend validates the session, sets its user/org transaction-locally, then
-- drops privileges. This helper only exposes a membership boolean.
create function app_private.knowledge_member(target uuid, writing boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (
   select 1 from public.ophanim_organization_memberships m
   where m.user_id = nullif(current_setting('ophanim.user_id', true),'')::uuid
     and m.organization_id = nullif(current_setting('ophanim.organization_id', true),'')::uuid
     and (target is null or m.organization_id = target)
     and (not writing or m.role in ('owner','operations_manager','analyst'))
 )
$$;
revoke all on function app_private.knowledge_member(uuid,boolean) from public, anon, authenticated;
grant execute on function app_private.knowledge_member(uuid,boolean) to ophanim_knowledge_app;

do $$ declare t text; begin
  foreach t in array array['ophanim_knowledge_documents','ophanim_knowledge_chunks','ophanim_knowledge_embeddings','ophanim_knowledge_jobs'] loop
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to ophanim_knowledge_app, authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to ophanim_knowledge_worker',t);
    execute format('create policy knowledge_app_read on public.%I for select to ophanim_knowledge_app using (app_private.knowledge_member(organization_id,false))',t);
    execute format('create policy knowledge_auth_read on public.%I for select to authenticated using ((select auth.uid()) is not null and (organization_id is null or app_private.is_organization_member(organization_id)))',t);
    execute format('create policy knowledge_worker on public.%I for all to ophanim_knowledge_worker using (true) with check (true)',t);
  end loop;
end $$;
-- Only the trusted queue worker modifies chunk/embedding content and shared data.
grant insert,update,delete on public.ophanim_knowledge_documents to ophanim_knowledge_app;
grant insert,update on public.ophanim_knowledge_jobs to ophanim_knowledge_app;
create policy knowledge_app_write on public.ophanim_knowledge_documents for all to ophanim_knowledge_app
 using (organization_id is not null and app_private.knowledge_member(organization_id,true))
 with check (organization_id is not null and app_private.knowledge_member(organization_id,true));
create policy knowledge_app_write on public.ophanim_knowledge_jobs for all to ophanim_knowledge_app
 using (organization_id is not null and app_private.knowledge_member(organization_id,true))
 with check (organization_id is not null and app_private.knowledge_member(organization_id,true));
