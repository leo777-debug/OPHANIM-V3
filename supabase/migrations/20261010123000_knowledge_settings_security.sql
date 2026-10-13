revoke all on public.ophanim_knowledge_settings from public,anon,authenticated;
grant select on public.ophanim_knowledge_settings to authenticated,ophanim_knowledge_app,ophanim_knowledge_worker;
grant insert,update,delete on public.ophanim_knowledge_settings to ophanim_knowledge_app;
create policy knowledge_settings_app_read on public.ophanim_knowledge_settings for select to ophanim_knowledge_app using (app_private.knowledge_member(organization_id,false));
create policy knowledge_settings_auth_read on public.ophanim_knowledge_settings for select to authenticated using (app_private.is_organization_member(organization_id));
create policy knowledge_settings_worker_read on public.ophanim_knowledge_settings for select to ophanim_knowledge_worker using (true);
create policy knowledge_settings_write on public.ophanim_knowledge_settings for all to ophanim_knowledge_app
 using (app_private.knowledge_member(organization_id,true)) with check (app_private.knowledge_member(organization_id,true));
