import { db } from '@/lib/watchlists/db';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';
import { getDisruption } from './disruptions';
import { getShipment } from './shipments';
import { validateRescueActionInput, validateRescueCaseInput, validateRescueCaseStatus, validateRescueDecisionInput, validateRescueEvidenceInput, type RescueActionStatus, type RescueActionType, type RescueCaseStatus, type RescueDecision, type RescueEvidenceType } from './rescue-validation';

export interface RescueAction { id: string; rescueCaseId: string; actionType: RescueActionType; title: string; description?: string; actionStatus: RescueActionStatus; targetAt?: string; createdAt: string; }
export interface RescueDecisionRecord { id: string; rescueCaseId: string; actionId?: string; decision: RescueDecision; rationale: string; recordedAt: string; }
export interface RescueEvidenceRecord { id: string; rescueCaseId: string; actionId?: string; evidenceType: RescueEvidenceType; title: string; sourceUrl: string; description?: string; capturedAt: string; }
export interface RescueCase { id: string; organizationId: string; shipmentId: string; shipmentReference: string; disruptionId?: string; disruptionTitle?: string; impactAssessmentId?: string; caseStatus: RescueCaseStatus; objective: string; summary?: string; createdAt: string; updatedAt: string; actions?: RescueAction[]; decisions?: RescueDecisionRecord[]; evidence?: RescueEvidenceRecord[]; }

interface CaseRow { id: string; organization_id: string; shipment_id: string; shipment_reference: string; disruption_id: string | null; disruption_title: string | null; impact_assessment_id: string | null; case_status: RescueCaseStatus; objective: string; summary: string | null; created_at: string; updated_at: string; }
interface ActionRow { id: string; rescue_case_id: string; action_type: RescueActionType; title: string; description: string | null; action_status: RescueActionStatus; target_at: string | null; created_at: string; }
interface DecisionRow { id: string; rescue_case_id: string; rescue_action_id: string | null; decision: RescueDecision; rationale: string; recorded_at: string; }
interface EvidenceRow { id: string; rescue_case_id: string; rescue_action_id: string | null; evidence_type: RescueEvidenceType; title: string; source_url: string; description: string | null; captured_at: string; }

const caseFields = `rescue.id, rescue.organization_id, rescue.shipment_id, shipment.shipment_reference, rescue.disruption_id, disruption.title as disruption_title, rescue.impact_assessment_id, rescue.case_status, rescue.objective, rescue.summary, rescue.created_at, rescue.updated_at`;
const caseFrom = `from ophanim_rescue_cases rescue join ophanim_shipments shipment on shipment.id = rescue.shipment_id left join ophanim_disruptions disruption on disruption.id = rescue.disruption_id`;

function toCase(row: CaseRow): RescueCase { return { id: row.id, organizationId: row.organization_id, shipmentId: row.shipment_id, shipmentReference: row.shipment_reference, disruptionId: row.disruption_id ?? undefined, disruptionTitle: row.disruption_title ?? undefined, impactAssessmentId: row.impact_assessment_id ?? undefined, caseStatus: row.case_status, objective: row.objective, summary: row.summary ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at }; }
function toAction(row: ActionRow): RescueAction { return { id: row.id, rescueCaseId: row.rescue_case_id, actionType: row.action_type, title: row.title, description: row.description ?? undefined, actionStatus: row.action_status, targetAt: row.target_at ?? undefined, createdAt: row.created_at }; }
function toDecision(row: DecisionRow): RescueDecisionRecord { return { id: row.id, rescueCaseId: row.rescue_case_id, actionId: row.rescue_action_id ?? undefined, decision: row.decision, rationale: row.rationale, recordedAt: row.recorded_at }; }
function toEvidence(row: EvidenceRow): RescueEvidenceRecord { return { id: row.id, rescueCaseId: row.rescue_case_id, actionId: row.rescue_action_id ?? undefined, evidenceType: row.evidence_type, title: row.title, sourceUrl: row.source_url, description: row.description ?? undefined, capturedAt: row.captured_at }; }

async function caseRow(actor: OrganizationActor, caseId: string): Promise<CaseRow | null> {
  const result = await db().query<CaseRow>(`select ${caseFields} ${caseFrom} where rescue.id = $1 and rescue.organization_id = $2`, [caseId, actor.organizationId]);
  return result.rows[0] ?? null;
}

async function ensureActionBelongsToCase(caseId: string, actionId: string): Promise<void> {
  const result = await db().query('select 1 from ophanim_rescue_actions where id = $1 and rescue_case_id = $2', [actionId, caseId]);
  if (!result.rowCount) throw new Error('Rescue action not found for this case.');
}

export async function listRescueCases(actor: OrganizationActor): Promise<RescueCase[]> {
  requireOrganizationAccess(actor, actor.organizationId, 'rescue:read');
  const rows = await db().query<CaseRow>(`select ${caseFields} ${caseFrom} where rescue.organization_id = $1 order by rescue.case_status = 'closed', rescue.updated_at desc`, [actor.organizationId]);
  return rows.rows.map(toCase);
}

export async function getRescueCase(actor: OrganizationActor, caseId: string): Promise<RescueCase | null> {
  requireOrganizationAccess(actor, actor.organizationId, 'rescue:read');
  const row = await caseRow(actor, caseId);
  if (!row) return null;
  const [actions, decisions, evidence] = await Promise.all([
    db().query<ActionRow>('select id, rescue_case_id, action_type, title, description, action_status, target_at, created_at from ophanim_rescue_actions where rescue_case_id = $1 order by created_at asc', [caseId]),
    db().query<DecisionRow>('select id, rescue_case_id, rescue_action_id, decision, rationale, recorded_at from ophanim_rescue_decisions where rescue_case_id = $1 order by recorded_at desc', [caseId]),
    db().query<EvidenceRow>('select id, rescue_case_id, rescue_action_id, evidence_type, title, source_url, description, captured_at from ophanim_rescue_evidence where rescue_case_id = $1 order by captured_at desc', [caseId]),
  ]);
  return { ...toCase(row), actions: actions.rows.map(toAction), decisions: decisions.rows.map(toDecision), evidence: evidence.rows.map(toEvidence) };
}

export async function createRescueCase(actor: OrganizationActor, input: unknown): Promise<RescueCase> {
  requireOrganizationAccess(actor, actor.organizationId, 'rescue:write');
  const rescue = validateRescueCaseInput(input);
  const shipment = await getShipment(actor, rescue.shipmentId);
  if (!shipment) throw new Error('Shipment not found.');
  if (rescue.disruptionId && !(await getDisruption(actor, rescue.disruptionId))) throw new Error('Disruption not found.');
  if (rescue.impactAssessmentId) {
    const assessment = await db().query('select shipment_id, disruption_id from ophanim_shipment_impact_assessments where id = $1 and organization_id = $2', [rescue.impactAssessmentId, actor.organizationId]);
    if (!assessment.rowCount || assessment.rows[0].shipment_id !== rescue.shipmentId || (rescue.disruptionId && assessment.rows[0].disruption_id !== rescue.disruptionId)) throw new Error('Impact assessment does not match this rescue case.');
  }
  const client = await db().connect();
  try {
    await client.query('begin');
    const created = await client.query<CaseRow>(`insert into ophanim_rescue_cases (organization_id, shipment_id, disruption_id, impact_assessment_id, objective, summary, owner_user_id, created_by_user_id) values ($1, $2, $3, $4, $5, $6, $7, $7) returning id, organization_id, shipment_id, $8::text as shipment_reference, disruption_id, null::text as disruption_title, impact_assessment_id, case_status, objective, summary, created_at, updated_at`, [actor.organizationId, rescue.shipmentId, rescue.disruptionId ?? null, rescue.impactAssessmentId ?? null, rescue.objective, rescue.summary ?? null, actor.userId, shipment.shipmentReference]);
    const record = created.rows[0];
    await client.query(`insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata) values ($1, $2, 'rescue_case.created', 'rescue_case', $3, $4)`, [actor.organizationId, actor.userId, record.id, JSON.stringify({ shipmentId: rescue.shipmentId, disruptionId: rescue.disruptionId })]);
    await client.query('commit');
    return (await getRescueCase(actor, record.id))!;
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
}

export async function updateRescueCaseStatus(actor: OrganizationActor, caseId: string, value: unknown): Promise<RescueCase | null> {
  requireOrganizationAccess(actor, actor.organizationId, 'rescue:write');
  const status = validateRescueCaseStatus((value as Record<string, unknown>)?.caseStatus);
  const result = await db().query('update ophanim_rescue_cases set case_status = $3, updated_at = now() where id = $1 and organization_id = $2 returning id', [caseId, actor.organizationId, status]);
  if (!result.rowCount) return null;
  await db().query(`insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata) values ($1, $2, 'rescue_case.status_updated', 'rescue_case', $3, $4)`, [actor.organizationId, actor.userId, caseId, JSON.stringify({ caseStatus: status })]);
  return getRescueCase(actor, caseId);
}

export async function addRescueAction(actor: OrganizationActor, caseId: string, input: unknown): Promise<RescueAction> {
  requireOrganizationAccess(actor, actor.organizationId, 'rescue:write');
  if (!(await caseRow(actor, caseId))) throw new Error('Rescue case not found.');
  const action = validateRescueActionInput(input);
  const result = await db().query<ActionRow>('insert into ophanim_rescue_actions (rescue_case_id, action_type, title, description, target_at, created_by_user_id) values ($1, $2, $3, $4, $5, $6) returning id, rescue_case_id, action_type, title, description, action_status, target_at, created_at', [caseId, action.actionType, action.title, action.description ?? null, action.targetAt ?? null, actor.userId]);
  await db().query(`insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata) values ($1, $2, 'rescue_action.created', 'rescue_action', $3, $4)`, [actor.organizationId, actor.userId, result.rows[0].id, JSON.stringify({ rescueCaseId: caseId, actionType: action.actionType })]);
  return toAction(result.rows[0]);
}

export async function recordRescueDecision(actor: OrganizationActor, caseId: string, input: unknown): Promise<RescueDecisionRecord> {
  requireOrganizationAccess(actor, actor.organizationId, 'rescue:write');
  if (!(await caseRow(actor, caseId))) throw new Error('Rescue case not found.');
  const decision = validateRescueDecisionInput(input);
  if (decision.actionId) await ensureActionBelongsToCase(caseId, decision.actionId);
  const client = await db().connect();
  try {
    await client.query('begin');
    const recorded = await client.query<DecisionRow>('insert into ophanim_rescue_decisions (rescue_case_id, rescue_action_id, decision, rationale, recorded_by_user_id) values ($1, $2, $3, $4, $5) returning id, rescue_case_id, rescue_action_id, decision, rationale, recorded_at', [caseId, decision.actionId ?? null, decision.decision, decision.rationale, actor.userId]);
    if (decision.actionId && ['approved', 'rejected'].includes(decision.decision)) await client.query('update ophanim_rescue_actions set action_status = $3, updated_at = now() where id = $1 and rescue_case_id = $2', [decision.actionId, caseId, decision.decision]);
    await client.query(`insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata) values ($1, $2, 'rescue_decision.recorded', 'rescue_case', $3, $4)`, [actor.organizationId, actor.userId, caseId, JSON.stringify({ decision: decision.decision, actionId: decision.actionId })]);
    await client.query('commit');
    return toDecision(recorded.rows[0]);
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
}

export async function addRescueEvidence(actor: OrganizationActor, caseId: string, input: unknown): Promise<RescueEvidenceRecord> {
  requireOrganizationAccess(actor, actor.organizationId, 'rescue:write');
  if (!(await caseRow(actor, caseId))) throw new Error('Rescue case not found.');
  const evidence = validateRescueEvidenceInput(input);
  if (evidence.actionId) await ensureActionBelongsToCase(caseId, evidence.actionId);
  const result = await db().query<EvidenceRow>('insert into ophanim_rescue_evidence (rescue_case_id, rescue_action_id, evidence_type, title, source_url, description, captured_by_user_id) values ($1, $2, $3, $4, $5, $6, $7) returning id, rescue_case_id, rescue_action_id, evidence_type, title, source_url, description, captured_at', [caseId, evidence.actionId ?? null, evidence.evidenceType, evidence.title, evidence.sourceUrl, evidence.description ?? null, actor.userId]);
  await db().query(`insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata) values ($1, $2, 'rescue_evidence.captured', 'rescue_case', $3, $4)`, [actor.organizationId, actor.userId, caseId, JSON.stringify({ evidenceType: evidence.evidenceType, actionId: evidence.actionId })]);
  return toEvidence(result.rows[0]);
}
