-- Child links also need target ownership checks when services bypass RLS.
create or replace function ophanim_guard_evidence_target() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare evidence_org uuid; permitted boolean := false;
begin
  select organization_id into evidence_org from ophanim_evidence where id=new.evidence_id;
  if not found then raise exception 'Evidence record is not accessible' using errcode='42501'; end if;
  case new.resource_type
    when 'entity' then
      select exists(select 1 from ophanim_entities where id=new.resource_id and (visibility='global' or (evidence_org is not null and organization_id=evidence_org))) into permitted;
    when 'event' then
      select exists(select 1 from ophanim_events where id=new.resource_id and (visibility='global' or (evidence_org is not null and organization_id=evidence_org))) into permitted;
    when 'case' then
      select exists(select 1 from ophanim_cases where id=new.resource_id and organization_id=evidence_org) into permitted;
    when 'task' then
      select exists(select 1 from ophanim_case_tasks task join ophanim_cases parent on parent.id=task.case_id where task.id=new.resource_id and parent.organization_id=evidence_org) into permitted;
    when 'assessment' then
      select exists(select 1 from ophanim_assessments where id=new.resource_id and organization_id=evidence_org) into permitted;
    else permitted := false;
  end case;
  if not permitted then raise exception 'Evidence target is not accessible in this organization' using errcode='42501'; end if;
  return new;
end $$;
create trigger ophanim_evidence_target_tenant_guard
before insert or update on ophanim_evidence_links
for each row execute function ophanim_guard_evidence_target();

create or replace function ophanim_guard_case_template() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.workflow_template_id is not null and not exists (
    select 1 from ophanim_workflow_templates where id=new.workflow_template_id
      and (organization_id=new.organization_id or organization_id is null)
  ) then raise exception 'Workflow template is not accessible in this organization' using errcode='42501'; end if;
  return new;
end $$;
create trigger ophanim_case_template_tenant_guard
before insert or update of workflow_template_id, organization_id on ophanim_cases
for each row execute function ophanim_guard_case_template();
