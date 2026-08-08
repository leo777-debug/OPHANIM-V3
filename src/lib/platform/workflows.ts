import { db } from '@/lib/db/pool';
import type { OrganizationActor } from '@/lib/operations/types';
import type { CaseInput, CaseTaskInput } from './types';
import { object, optionalDate, text, uuid } from './validation';

export function parseCaseInput(value: unknown): CaseInput {
  const input = object(value, 'Case');
  const priority = input.priority ?? 'normal';
  if (!['low', 'normal', 'high', 'critical'].includes(String(priority))) throw new Error('Case priority is invalid.');
  const ids = (field: 'entityIds' | 'eventIds') => input[field] === undefined ? [] : Array.isArray(input[field]) ? input[field].map((id) => uuid(id, field)).slice(0, 100) : (() => { throw new Error(`${field} must be an array.`); })();
  return { title: text(input.title, 'Case title', 500)!, description: text(input.description, 'Case description', 10000, false), workflowTemplateId: input.workflowTemplateId ? uuid(input.workflowTemplateId, 'Workflow template ID') : undefined, priority: priority as CaseInput['priority'], deadlineAt: optionalDate(input.deadlineAt, 'Case deadline'), entityIds: ids('entityIds'), eventIds: ids('eventIds') };
}

export function parseCaseTaskInput(value: unknown): CaseTaskInput {
  const input = object(value, 'Task');
  const priority = input.priority ?? 'normal';
  if (!['low', 'normal', 'high', 'critical'].includes(String(priority))) throw new Error('Task priority is invalid.');
  return { title: text(input.title, 'Task title', 500)!, description: text(input.description, 'Task description', 10000, false), priority: priority as CaseTaskInput['priority'], dueAt: optionalDate(input.dueAt, 'Task due date'), assigneeUserId: input.assigneeUserId ? uuid(input.assigneeUserId, 'Task assignee') : undefined };
}

export async function listCases(actor: OrganizationActor) {
  const result = await db().query(`select case_record.*,template.name as workflow_template_name from ophanim_cases case_record left join ophanim_workflow_templates template on template.id=case_record.workflow_template_id where case_record.organization_id=$1 order by case_record.deadline_at nulls last,case_record.updated_at desc limit 100`, [actor.organizationId]);
  return result.rows;
}

export async function getCase(actor: OrganizationActor, caseId: string) {
  const base = await db().query(`select case_record.*,template.name as workflow_template_name from ophanim_cases case_record left join ophanim_workflow_templates template on template.id=case_record.workflow_template_id where case_record.id=$1 and case_record.organization_id=$2`, [caseId, actor.organizationId]);
  if (!base.rows[0]) return null;
  const [tasks, entities, events, comments, evidence] = await Promise.all([
    db().query(`select * from ophanim_case_tasks where case_id=$1 order by due_at nulls last,created_at`, [caseId]),
    db().query(`select entity.id,entity.entity_type,entity.canonical_name from ophanim_case_entities link join ophanim_entities entity on entity.id=link.entity_id where link.case_id=$1`, [caseId]),
    db().query(`select event.id,event.event_type,event.title,event.event_status from ophanim_case_events link join ophanim_events event on event.id=link.event_id where link.case_id=$1`, [caseId]),
    db().query(`select comment.*,user_record.display_name,user_record.email from ophanim_case_comments comment left join ophanim_users user_record on user_record.id=comment.author_user_id where comment.case_id=$1 order by comment.created_at`, [caseId]),
    db().query(`select evidence.* from ophanim_evidence_links link join ophanim_evidence evidence on evidence.id=link.evidence_id where link.resource_type='case' and link.resource_id=$1 order by evidence.created_at desc`, [caseId]),
  ]);
  return { ...base.rows[0], tasks: tasks.rows, entities: entities.rows, events: events.rows, comments: comments.rows, evidence: evidence.rows };
}

export async function createCase(actor: OrganizationActor, value: unknown) {
  const input = parseCaseInput(value);
  const client = await db().connect();
  try {
    await client.query('begin');
    const result = await client.query<{ id: string }>(`insert into ophanim_cases(organization_id,workflow_template_id,title,description,priority,deadline_at,owner_user_id,created_by_user_id) values($1,$2,$3,$4,$5,$6,$7,$7) returning id`, [actor.organizationId, input.workflowTemplateId ?? null, input.title, input.description ?? null, input.priority, input.deadlineAt ?? null, actor.userId]);
    const id = result.rows[0].id;
    for (const entityId of input.entityIds ?? []) await client.query(`insert into ophanim_case_entities(case_id,entity_id) select $1,id from ophanim_entities where id=$2 and (organization_id=$3 or visibility='global') on conflict do nothing`, [id, entityId, actor.organizationId]);
    for (const eventId of input.eventIds ?? []) await client.query(`insert into ophanim_case_events(case_id,event_id) select $1,id from ophanim_events where id=$2 and (organization_id=$3 or visibility='global') on conflict do nothing`, [id, eventId, actor.organizationId]);
    await client.query(`insert into ophanim_case_activity(case_id,actor_user_id,activity_type,payload) values($1,$2,'case.created',$3)`, [id, actor.userId, JSON.stringify({ title: input.title })]);
    await client.query('commit');
    return getCase(actor, id);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

export async function createCaseTask(actor: OrganizationActor, caseId: string, value: unknown) {
  const input = parseCaseTaskInput(value);
  const owner = await db().query(`select 1 from ophanim_cases where id=$1 and organization_id=$2`, [caseId, actor.organizationId]);
  if (!owner.rowCount) throw new Error('Case not found.');
  const result = await db().query(`insert into ophanim_case_tasks(case_id,title,description,priority,due_at,assignee_user_id,created_by_user_id) values($1,$2,$3,$4,$5,$6,$7) returning *`, [caseId, input.title, input.description ?? null, input.priority, input.dueAt ?? null, input.assigneeUserId ?? null, actor.userId]);
  await db().query(`insert into ophanim_case_activity(case_id,actor_user_id,activity_type,payload) values($1,$2,'task.created',$3)`, [caseId, actor.userId, JSON.stringify({ taskId: result.rows[0].id, title: input.title })]);
  return result.rows[0];
}

export async function listWorkflowTemplates(actor: OrganizationActor) {
  const result = await db().query(`select * from ophanim_workflow_templates where enabled and (organization_id=$1 or organization_id is null) order by organization_id nulls first,name`, [actor.organizationId]);
  return result.rows;
}
