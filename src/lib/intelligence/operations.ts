import { listCyberAssets, listCyberClients, listVendorDependencies } from '@/lib/cyber/inventory';
import type { MentionReviewStatus } from '@/lib/dark-web/types';
import { listShipments } from '@/lib/logistics/shipments';
import { createRescueCase, type RescueCase } from '@/lib/logistics/rescue';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';
import { db } from '@/lib/watchlists/db';
import { assessConfidence, type ConfidenceAssessment } from './confidence';
import { correlateCyber, correlateShipment, type CorrelationCandidate, type CorrelationSubjectType } from './correlation';
import { queueIntelligenceAlertDeliveries, type AlertDeliveryCandidate } from './notifications';

export const REVIEW_STATUSES = ['new', 'needs_triage', 'under_review', 'likely_relevant', 'false_positive', 'duplicate', 'escalated', 'monitoring', 'closed'] as const;
export const ALERT_STATUSES = ['open', 'acknowledged', 'muted', 'snoozed', 'closed'] as const;
export const TASK_STATUSES = ['open', 'in_progress', 'blocked', 'completed', 'cancelled'] as const;
export type IntelligenceReviewStatus = (typeof REVIEW_STATUSES)[number];
export type IntelligenceAlertStatus = (typeof ALERT_STATUSES)[number];
export type IntelligenceTaskStatus = (typeof TASK_STATUSES)[number];

interface MentionRow {
  id: string; title: string | null; original_text: string; translated_text: string | null; source_reliability: number;
  source_chain_label: 'likely_original' | 'likely_copy' | 'possible_copy' | 'independent_source' | 'relationship_unknown'; independent_source_count: number;
  first_seen_at: string; source_name: string; source_reference: string | null; review_status: MentionReviewStatus;
  best_match: number | null; requires_review: boolean | null; match_count: number;
}

export interface SignalAssessment {
  id: string; mentionId: string; subjectType: CorrelationSubjectType; subjectId: string; subjectLabel: string; assessmentStatus: string;
  confidenceScore: number; confidenceLevel: ConfidenceAssessment['level']; confidenceBreakdown: ConfidenceAssessment['breakdown']; correlationSignals: Array<{ kind: string; value: string; score: number }>;
  nextMilestoneAt?: string; lastSafeMoveAt?: string; lastSafeMoveSource?: string; createdAt: string; updatedAt: string;
}

export interface IntelligenceQueueItem {
  mentionId: string; title?: string; sourceName: string; sourceReference?: string; reviewStatus: IntelligenceReviewStatus; analystNote?: string;
  confidenceScore?: number; confidenceLevel?: ConfidenceAssessment['level']; subjectLabel?: string; subjectType?: CorrelationSubjectType; assessmentId?: string; nextMilestoneAt?: string; lastSafeMoveAt?: string; lastSafeMoveSource?: string; updatedAt: string;
}

export interface IntelligenceAlert {
  id: string; assessmentId: string; category: 'logistics' | 'cyber'; title: string; summary: string; status: IntelligenceAlertStatus;
  snoozedUntil?: string; subjectLabel: string; confidenceScore: number; confidenceLevel: ConfidenceAssessment['level']; sourceName: string; sourceReference?: string; updatedAt: string;
}

export interface OperationalTask { id: string; workflowType: 'shipment_exposure' | 'cyber_exposure' | 'rescue_case' | 'roll_call'; workflowId: string; title: string; taskStatus: IntelligenceTaskStatus; priority: 'low' | 'normal' | 'high' | 'critical'; dueAt?: string; completionNote?: string; createdAt: string; updatedAt: string; }
export interface IntelligenceDeliveryLog { id: string; kind: 'immediate' | 'digest'; status: 'pending' | 'sent' | 'failed' | 'suppressed'; attempts: number; email: string; title: string; subjectLabel: string; error?: string; createdAt: string; sentAt?: string; }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, name: string, max = 4000, required = false) => { if (value === undefined || value === null || value === '') { if (required) throw new Error(`${name} is required.`); return undefined; } if (typeof value !== 'string') throw new Error(`${name} must be text.`); const result = value.trim().replace(/\s+/g, ' '); if (!result && required) throw new Error(`${name} is required.`); if (result.length > max) throw new Error(`${name} is too long.`); return result || undefined; };
const id = (value: unknown, name: string, required = false) => { const result = text(value, name, 36, required); if (result && !UUID.test(result)) throw new Error(`${name} is invalid.`); return result; };
const timestamp = (value: unknown, name: string) => { const result = text(value, name, 64); if (result && !Number.isFinite(Date.parse(result))) throw new Error(`${name} is invalid.`); return result; };

function assessmentFrom(row: Record<string, unknown>): SignalAssessment {
  return { id: String(row.id), mentionId: String(row.mention_id), subjectType: row.subject_type as CorrelationSubjectType, subjectId: String(row.subject_id), subjectLabel: String(row.subject_label), assessmentStatus: String(row.assessment_status), confidenceScore: Number(row.confidence_score), confidenceLevel: row.confidence_level as ConfidenceAssessment['level'], confidenceBreakdown: (row.confidence_breakdown ?? {}) as ConfidenceAssessment['breakdown'], correlationSignals: Array.isArray(row.correlation_signals) ? row.correlation_signals as SignalAssessment['correlationSignals'] : [], nextMilestoneAt: row.next_milestone_at ? String(row.next_milestone_at) : undefined, lastSafeMoveAt: row.last_safe_move_at ? String(row.last_safe_move_at) : undefined, lastSafeMoveSource: row.last_safe_move_source ? String(row.last_safe_move_source) : undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

function alertSummary(candidate: CorrelationCandidate): string {
  return `An unverified intelligence signal matched ${candidate.signals.length} stored ${candidate.subjectType.replace('_', ' ')} identifier${candidate.signals.length === 1 ? '' : 's'} for ${candidate.subjectLabel}. Analyst verification is required before action.`;
}

async function activeMentions(actor: OrganizationActor): Promise<MentionRow[]> {
  return (await db().query<MentionRow>(
    `select mention.id, mention.title, mention.original_text, mention.translated_text, mention.source_reliability, mention.source_chain_label, mention.independent_source_count, mention.first_seen_at, mention.source_name, mention.source_reference, mention.review_status,
            max(match.confidence_contribution) as best_match, bool_or(match.requires_review) as requires_review, count(match.id)::int as match_count
       from ophanim_dark_web_mentions mention left join ophanim_mention_entity_matches match on match.mention_id = mention.id
      where mention.organization_id = $1 and mention.review_status not in ('false_positive', 'duplicate', 'closed')
      group by mention.id order by mention.first_seen_at desc limit 200`,
    [actor.organizationId],
  )).rows;
}

async function upsertReview(actor: OrganizationActor, mentionId: string) {
  await db().query(`insert into ophanim_intelligence_reviews(organization_id, mention_id, review_status) values($1, $2, 'new') on conflict(mention_id) do nothing`, [actor.organizationId, mentionId]);
}

async function upsertAssessment(actor: OrganizationActor, mention: MentionRow, candidate: CorrelationCandidate, confidence: ConfidenceAssessment): Promise<{ assessment: SignalAssessment; alert?: AlertDeliveryCandidate }> {
  const status = confidence.level === 'insufficient' ? 'unverified_claim' : candidate.signals.some((signal) => signal.score >= 90) ? 'requires_verification' : 'likely_relevant';
  const result = await db().query<Record<string, unknown>>(
    `insert into ophanim_signal_assessments(organization_id, mention_id, subject_type, subject_id, subject_label, assessment_status, confidence_score, confidence_level, confidence_breakdown, correlation_signals, next_milestone_at, last_safe_move_at, last_safe_move_source, owner_user_id)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict(organization_id, mention_id, subject_type, subject_id) do update set subject_label = excluded.subject_label, assessment_status = case when ophanim_signal_assessments.assessment_status in ('confirmed_identity', 'cleared') then ophanim_signal_assessments.assessment_status else excluded.assessment_status end, confidence_score = excluded.confidence_score, confidence_level = excluded.confidence_level, confidence_breakdown = excluded.confidence_breakdown, correlation_signals = excluded.correlation_signals, next_milestone_at = excluded.next_milestone_at, last_safe_move_at = excluded.last_safe_move_at, last_safe_move_source = excluded.last_safe_move_source, owner_user_id = coalesce(ophanim_signal_assessments.owner_user_id, excluded.owner_user_id), updated_at = now()
     returning id, mention_id, subject_type, subject_id, subject_label, assessment_status, confidence_score, confidence_level, confidence_breakdown, correlation_signals, next_milestone_at, last_safe_move_at, last_safe_move_source, created_at, updated_at`,
    [actor.organizationId, mention.id, candidate.subjectType, candidate.subjectId, candidate.subjectLabel, status, confidence.score, confidence.level, JSON.stringify(confidence.breakdown), JSON.stringify(candidate.signals), candidate.nextMilestoneAt ?? null, candidate.lastSafeMoveAt ?? null, candidate.lastSafeMoveSource ?? null, candidate.ownerUserId ?? null],
  );
  const assessment = assessmentFrom(result.rows[0]);
  if (confidence.score < 55 || assessment.assessmentStatus === 'cleared') return { assessment };
  const category = candidate.subjectType === 'shipment' ? 'logistics' : 'cyber';
  const createdAlert = await db().query<{ id: string }>(
    `insert into ophanim_intelligence_alerts(organization_id, assessment_id, alert_category, title, summary)
     values($1,$2,$3,$4,$5) on conflict(assessment_id) do nothing returning id`,
    [actor.organizationId, assessment.id, category, `Unverified ${category} signal`, alertSummary(candidate)],
  );
  const alertId = createdAlert.rows[0]?.id;
  if (!alertId) return { assessment };
  await db().query(`insert into ophanim_operational_tasks(organization_id, workflow_type, workflow_id, title, priority, assigned_to_user_id, due_at, created_by_user_id)
    values($1,$2,$3,$4,$5,$6,$7,$8)`, [actor.organizationId, candidate.subjectType === 'shipment' ? 'shipment_exposure' : 'cyber_exposure', assessment.id, `Verify intelligence signal for ${candidate.subjectLabel}`, confidence.level === 'high' ? 'high' : 'normal', candidate.ownerUserId ?? null, candidate.nextMilestoneAt ?? null, actor.userId]);
  return { assessment, alert: { id: alertId, organizationId: actor.organizationId, assessmentId: assessment.id, category, title: `Unverified ${category} signal`, summary: alertSummary(candidate), confidenceScore: confidence.score, subjectLabel: candidate.subjectLabel, sourceName: mention.source_name, sourceReference: mention.source_reference ?? undefined } };
}

export async function reconcileIntelligence(actor: OrganizationActor) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write');
  const [mentions, shipments, clients, assets, dependencies] = await Promise.all([activeMentions(actor), listShipments(actor), listCyberClients(actor), listCyberAssets(actor), listVendorDependencies(actor)]);
  const assessments: SignalAssessment[] = []; const alerts: AlertDeliveryCandidate[] = [];
  for (const mention of mentions) {
    const source = `${mention.title ?? ''} ${mention.original_text} ${mention.translated_text ?? ''}`;
    const candidates = [...shipments.map((shipment) => correlateShipment(source, shipment)).filter((item): item is CorrelationCandidate => Boolean(item)), ...correlateCyber(source, clients, assets, dependencies)];
    const confidence = assessConfidence({ matchStrength: Math.max(Number(mention.best_match ?? 0), ...candidates.flatMap((candidate) => candidate.signals.map((signal) => signal.score)), 0), sourceReliability: mention.source_reliability, independentSourceCount: mention.independent_source_count, corroboratingSignals: Math.max(mention.match_count, ...candidates.map((candidate) => candidate.signals.length), 0), observedAt: mention.first_seen_at, sourceChainLabel: mention.source_chain_label, ambiguous: Boolean(mention.requires_review) });
    await db().query(`update ophanim_dark_web_mentions set confidence_score = $3, confidence_level = $4, confidence_breakdown = $5, updated_at = now() where id = $1 and organization_id = $2`, [mention.id, actor.organizationId, confidence.score, confidence.level, JSON.stringify(confidence.breakdown)]);
    if (candidates.length) await upsertReview(actor, mention.id);
    for (const candidate of candidates) {
      const result = await upsertAssessment(actor, mention, candidate, confidence); assessments.push(result.assessment); if (result.alert) alerts.push(result.alert);
    }
  }
  await Promise.all(alerts.map((alert) => queueIntelligenceAlertDeliveries(alert)));
  await db().query(`insert into ophanim_audit_events(organization_id, actor_user_id, action, subject_type, metadata) values($1,$2,'intelligence.reconciled','intelligence',$3)`, [actor.organizationId, actor.userId, JSON.stringify({ mentionCount: mentions.length, assessmentCount: assessments.length, alertCount: alerts.length })]);
  return { mentions: mentions.length, assessments, alertsCreated: alerts.length };
}

export async function listIntelligenceQueue(actor: OrganizationActor): Promise<IntelligenceQueueItem[]> {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:read');
  const result = await db().query<{
    mention_id: string; title: string | null; source_name: string; source_reference: string | null; review_status: IntelligenceReviewStatus; analyst_note: string | null; confidence_score: number | null; confidence_level: ConfidenceAssessment['level'] | null; subject_label: string | null; subject_type: CorrelationSubjectType | null; assessment_id: string | null; next_milestone_at: string | null; last_safe_move_at: string | null; last_safe_move_source: string | null; updated_at: string;
  }>(`select review.mention_id, mention.title, mention.source_name, mention.source_reference, review.review_status, review.analyst_note, assessment.confidence_score, assessment.confidence_level, assessment.subject_label, assessment.subject_type, assessment.id as assessment_id, assessment.next_milestone_at, assessment.last_safe_move_at, assessment.last_safe_move_source, greatest(review.updated_at, coalesce(assessment.updated_at, review.updated_at)) as updated_at
      from ophanim_intelligence_reviews review join ophanim_dark_web_mentions mention on mention.id = review.mention_id
      left join lateral (select * from ophanim_signal_assessments where mention_id = review.mention_id order by confidence_score desc, updated_at desc limit 1) assessment on true
     where review.organization_id = $1 order by review.review_status in ('closed', 'false_positive', 'duplicate'), assessment.confidence_score desc nulls last, review.updated_at desc`, [actor.organizationId]);
  return result.rows.map((row) => ({ mentionId: row.mention_id, title: row.title ?? undefined, sourceName: row.source_name, sourceReference: row.source_reference ?? undefined, reviewStatus: row.review_status, analystNote: row.analyst_note ?? undefined, confidenceScore: row.confidence_score ?? undefined, confidenceLevel: row.confidence_level ?? undefined, subjectLabel: row.subject_label ?? undefined, subjectType: row.subject_type ?? undefined, assessmentId: row.assessment_id ?? undefined, nextMilestoneAt: row.next_milestone_at ?? undefined, lastSafeMoveAt: row.last_safe_move_at ?? undefined, lastSafeMoveSource: row.last_safe_move_source ?? undefined, updatedAt: row.updated_at }));
}

export async function updateIntelligenceReview(actor: OrganizationActor, mentionId: string, input: unknown) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write'); if (!UUID.test(mentionId) || !isObject(input)) throw new Error('Review request is invalid.');
  const reviewStatus = text(input.reviewStatus, 'Review status', 64, true) as IntelligenceReviewStatus;
  if (!REVIEW_STATUSES.includes(reviewStatus)) throw new Error('Review status is invalid.');
  const selectedEntityId = id(input.selectedEntityId, 'Selected entity ID'); const selectedAssessmentId = id(input.selectedAssessmentId, 'Selected assessment ID'); const duplicateOfMentionId = id(input.duplicateOfMentionId, 'Duplicate mention ID'); const analystNote = text(input.analystNote, 'Analyst note');
  for (const [table, value, label] of [['ophanim_entities', selectedEntityId, 'Selected entity'], ['ophanim_signal_assessments', selectedAssessmentId, 'Selected assessment'], ['ophanim_dark_web_mentions', duplicateOfMentionId, 'Duplicate mention']] as const) if (value) { const found = await db().query(`select 1 from ${table} where id = $1 and organization_id = $2`, [value, actor.organizationId]); if (!found.rowCount) throw new Error(`${label} was not found.`); }
  const result = await db().query(`update ophanim_intelligence_reviews set review_status=$3, selected_entity_id=$4, selected_assessment_id=$5, duplicate_of_mention_id=$6, analyst_note=$7, reviewed_by_user_id=$8, reviewed_at=now(), updated_at=now() where mention_id=$1 and organization_id=$2 returning id`, [mentionId, actor.organizationId, reviewStatus, selectedEntityId ?? null, selectedAssessmentId ?? null, duplicateOfMentionId ?? null, analystNote ?? null, actor.userId]);
  if (!result.rowCount) throw new Error('Review item was not found.');
  await db().query(`update ophanim_dark_web_mentions set review_status=$3, analyst_notes=$4, updated_at=now() where id=$1 and organization_id=$2`, [mentionId, actor.organizationId, reviewStatus, analystNote ?? null]);
  if (['false_positive', 'duplicate', 'closed'].includes(reviewStatus)) await db().query(`update ophanim_signal_assessments set assessment_status='cleared', reviewed_by_user_id=$3, reviewed_at=now(), updated_at=now() where mention_id=$1 and organization_id=$2`, [mentionId, actor.organizationId, actor.userId]);
  if (reviewStatus === 'likely_relevant' && selectedAssessmentId) await db().query(`update ophanim_signal_assessments set assessment_status='confirmed_identity', reviewed_by_user_id=$3, reviewed_at=now(), updated_at=now() where id=$1 and organization_id=$2`, [selectedAssessmentId, actor.organizationId, actor.userId]);
  await db().query(`insert into ophanim_audit_events(organization_id, actor_user_id, action, subject_type, subject_id, metadata) values($1,$2,'intelligence.reviewed','dark_web_mention',$3,$4)`, [actor.organizationId, actor.userId, mentionId, JSON.stringify({ reviewStatus, selectedAssessmentId })]);
  return { mentionId, reviewStatus };
}

export async function startRescueForSignal(actor: OrganizationActor, assessmentId: string): Promise<RescueCase> {
  requireOrganizationAccess(actor, actor.organizationId, 'rescue:write'); if (!UUID.test(assessmentId)) throw new Error('Assessment ID is invalid.');
  const assessment = await db().query<{ subject_type: CorrelationSubjectType; subject_id: string; subject_label: string }>('select subject_type, subject_id, subject_label from ophanim_signal_assessments where id=$1 and organization_id=$2', [assessmentId, actor.organizationId]);
  const row = assessment.rows[0]; if (!row || row.subject_type !== 'shipment') throw new Error('A shipment assessment is required to start rescue.');
  const rescue = await createRescueCase(actor, { shipmentId: row.subject_id, objective: `Verify and protect shipment ${row.subject_label} after an unverified intelligence signal.`, summary: 'Created from an intelligence assessment. The source signal remains unverified.' });
  await db().query(`update ophanim_rescue_cases set signal_assessment_id=$3, updated_at=now() where id=$1 and organization_id=$2`, [rescue.id, actor.organizationId, assessmentId]);
  return rescue;
}

export async function startRemediationForSignal(actor: OrganizationActor, assessmentId: string) {
  requireOrganizationAccess(actor, actor.organizationId, 'cyber:write'); if (!UUID.test(assessmentId)) throw new Error('Assessment ID is invalid.');
  const assessment = await db().query<{ subject_type: CorrelationSubjectType; subject_id: string; subject_label: string; owner_user_id: string | null }>('select subject_type, subject_id, subject_label, owner_user_id from ophanim_signal_assessments where id=$1 and organization_id=$2', [assessmentId, actor.organizationId]);
  const row = assessment.rows[0]; if (!row || row.subject_type === 'shipment') throw new Error('A cyber assessment is required to start remediation.');
  let customerId: string | null = null;
  if (row.subject_type === 'cyber_client') customerId = row.subject_id;
  if (row.subject_type === 'cyber_asset') customerId = (await db().query<{ customer_id: string }>('select customer_id from ophanim_assets where id=$1 and organization_id=$2', [row.subject_id, actor.organizationId])).rows[0]?.customer_id ?? null;
  if (row.subject_type === 'vendor_dependency') customerId = (await db().query<{ customer_id: string }>('select customer_id from ophanim_vendor_dependencies where id=$1 and organization_id=$2', [row.subject_id, actor.organizationId])).rows[0]?.customer_id ?? null;
  const title = `Remediation room: ${row.subject_label}`;
  const summary = 'Created from an unverified intelligence assessment. Confirm scope and identity before taking any remediation action.';
  const draft = `Draft for human review: We are reviewing an unverified external intelligence signal associated with ${row.subject_label}. We have not confirmed impact. Please verify ownership, exposure, and current controls before any action is communicated.`;
  const room = await db().query<{ id: string }>(`insert into ophanim_remediation_rooms(organization_id,assessment_id,customer_id,title,summary,communication_draft,owner_user_id,created_by_user_id) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(assessment_id) do update set updated_at=now() returning id`, [actor.organizationId, assessmentId, customerId, title, summary, draft, row.owner_user_id, actor.userId]);
  await db().query(`insert into ophanim_operational_tasks(organization_id,workflow_type,workflow_id,title,priority,assigned_to_user_id,created_by_user_id) select $1,'cyber_exposure',$2,$3,'high',$4,$5 where not exists (select 1 from ophanim_operational_tasks where organization_id=$1 and workflow_type='cyber_exposure' and workflow_id=$2 and task_status in ('open','in_progress','blocked'))`, [actor.organizationId, assessmentId, `Verify exposure scope for ${row.subject_label}`, row.owner_user_id, actor.userId]);
  await db().query(`insert into ophanim_audit_events(organization_id, actor_user_id, action, subject_type, subject_id, metadata) values($1,$2,'intelligence.remediation_room_started','remediation_room',$3,$4)`, [actor.organizationId, actor.userId, room.rows[0].id, JSON.stringify({ assessmentId, customerId })]);
  return { remediationRoomId: room.rows[0].id, communicationDraft: draft };
}

export async function listIntelligenceAlerts(actor: OrganizationActor): Promise<IntelligenceAlert[]> {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:read');
  const result = await db().query<{ id: string; assessment_id: string; alert_category: 'logistics' | 'cyber'; title: string; summary: string; alert_status: IntelligenceAlertStatus; snoozed_until: string | null; subject_label: string; confidence_score: number; confidence_level: ConfidenceAssessment['level']; source_name: string; source_reference: string | null; updated_at: string }>(`select alert.id,alert.assessment_id,alert.alert_category,alert.title,alert.summary,alert.alert_status,alert.snoozed_until,assessment.subject_label,assessment.confidence_score,assessment.confidence_level,mention.source_name,mention.source_reference,alert.updated_at from ophanim_intelligence_alerts alert join ophanim_signal_assessments assessment on assessment.id=alert.assessment_id join ophanim_dark_web_mentions mention on mention.id=assessment.mention_id where alert.organization_id=$1 and (alert.alert_status <> 'snoozed' or alert.snoozed_until is null or alert.snoozed_until <= now()) order by alert.alert_status='closed',assessment.confidence_score desc,alert.updated_at desc`, [actor.organizationId]);
  return result.rows.map((row) => ({ id: row.id, assessmentId: row.assessment_id, category: row.alert_category, title: row.title, summary: row.summary, status: row.alert_status, snoozedUntil: row.snoozed_until ?? undefined, subjectLabel: row.subject_label, confidenceScore: row.confidence_score, confidenceLevel: row.confidence_level, sourceName: row.source_name, sourceReference: row.source_reference ?? undefined, updatedAt: row.updated_at }));
}

export async function updateIntelligenceAlert(actor: OrganizationActor, alertId: string, input: unknown) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write'); if (!UUID.test(alertId) || !isObject(input)) throw new Error('Alert request is invalid.');
  const status = text(input.status, 'Alert status', 64, true) as IntelligenceAlertStatus; if (!ALERT_STATUSES.includes(status)) throw new Error('Alert status is invalid.');
  const snoozedUntil = status === 'snoozed' ? timestamp(input.snoozedUntil, 'Snooze time') : undefined; if (status === 'snoozed' && !snoozedUntil) throw new Error('Snooze time is required.');
  const result = await db().query(`update ophanim_intelligence_alerts set alert_status=$3,snoozed_until=$4,acknowledged_by_user_id=case when $3='acknowledged' then $5 else acknowledged_by_user_id end,acknowledged_at=case when $3='acknowledged' then now() else acknowledged_at end,updated_at=now() where id=$1 and organization_id=$2 returning id`, [alertId, actor.organizationId, status, snoozedUntil ?? null, actor.userId]);
  if (!result.rowCount) throw new Error('Alert was not found.'); return { alertId, status };
}

export async function listOperationalTasks(actor: OrganizationActor): Promise<OperationalTask[]> {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:read'); const result = await db().query<Record<string, unknown>>(`select id,workflow_type,workflow_id,title,task_status,priority,due_at,completion_note,created_at,updated_at from ophanim_operational_tasks where organization_id=$1 order by task_status='completed',due_at nulls last,created_at desc`, [actor.organizationId]);
  return result.rows.map((row) => ({ id: String(row.id), workflowType: row.workflow_type as OperationalTask['workflowType'], workflowId: String(row.workflow_id), title: String(row.title), taskStatus: row.task_status as IntelligenceTaskStatus, priority: row.priority as OperationalTask['priority'], dueAt: row.due_at ? String(row.due_at) : undefined, completionNote: row.completion_note ? String(row.completion_note) : undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
}

export async function listIntelligenceDeliveryLogs(actor: OrganizationActor): Promise<IntelligenceDeliveryLog[]> {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:read');
  const result = await db().query<{ id: string; kind: IntelligenceDeliveryLog['kind']; status: IntelligenceDeliveryLog['status']; attempts: number; email: string; title: string; subject_label: string; error: string | null; created_at: string; sent_at: string | null }>(`select delivery.id,delivery.kind,delivery.status,delivery.attempts,setting.email,alert.title,assessment.subject_label,delivery.error,delivery.created_at,delivery.sent_at from ophanim_intelligence_deliveries delivery join ophanim_intelligence_notification_settings setting on setting.id=delivery.setting_id join ophanim_intelligence_alerts alert on alert.id=delivery.alert_id join ophanim_signal_assessments assessment on assessment.id=alert.assessment_id where delivery.organization_id=$1 order by delivery.created_at desc limit 100`, [actor.organizationId]);
  return result.rows.map((row) => ({ id: row.id, kind: row.kind, status: row.status, attempts: row.attempts, email: row.email, title: row.title, subjectLabel: row.subject_label, error: row.error ?? undefined, createdAt: row.created_at, sentAt: row.sent_at ?? undefined }));
}

export async function updateOperationalTask(actor: OrganizationActor, taskId: string, input: unknown) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write'); if (!UUID.test(taskId) || !isObject(input)) throw new Error('Task request is invalid.'); const taskStatus = text(input.taskStatus, 'Task status', 64, true) as IntelligenceTaskStatus; if (!TASK_STATUSES.includes(taskStatus)) throw new Error('Task status is invalid.'); const completionNote = text(input.completionNote, 'Completion note');
  const result = await db().query(`update ophanim_operational_tasks set task_status=$3,completion_note=$4,updated_at=now() where id=$1 and organization_id=$2 returning id`, [taskId, actor.organizationId, taskStatus, completionNote ?? null]); if (!result.rowCount) throw new Error('Task was not found.'); return { taskId, taskStatus };
}

export async function getIntelligenceNotificationSettings(actor: OrganizationActor) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:read');
  const result = await db().query<{ email: string; enabled: boolean; mode: 'immediate' | 'digest'; digest_minutes: number; minimum_confidence: number; next_digest_at: string | null }>('select email,enabled,mode,digest_minutes,minimum_confidence,next_digest_at from ophanim_intelligence_notification_settings where organization_id=$1 and user_id=$2', [actor.organizationId, actor.userId]);
  const row = result.rows[0]; return row ? { email: row.email, enabled: row.enabled, mode: row.mode, digestMinutes: row.digest_minutes, minimumConfidence: row.minimum_confidence, nextDigestAt: row.next_digest_at ?? undefined } : { email: (actor as OrganizationActor & { email?: string }).email ?? '', enabled: false, mode: 'immediate' as const, digestMinutes: 30, minimumConfidence: 55 };
}

export async function updateIntelligenceNotificationSettings(actor: OrganizationActor, input: unknown) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write'); if (!isObject(input)) throw new Error('Notification settings are invalid.'); const email = text(input.email, 'Email', 320, true)!; if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Email is invalid.'); const enabled = input.enabled === true; const mode = text(input.mode, 'Delivery mode', 32, true); if (mode !== 'immediate' && mode !== 'digest') throw new Error('Delivery mode is invalid.'); const digestMinutes = Number(input.digestMinutes ?? 30); if (![30, 60].includes(digestMinutes)) throw new Error('Digest interval must be 30 or 60 minutes.'); const minimumConfidence = Number(input.minimumConfidence ?? 55); if (!Number.isInteger(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 100) throw new Error('Minimum confidence must be from 0 to 100.');
  await db().query(`insert into ophanim_intelligence_notification_settings(organization_id,user_id,email,enabled,mode,digest_minutes,minimum_confidence,next_digest_at) values($1,$2,$3,$4,$5,$6,$7,case when $5='digest' then now()+($6||' minutes')::interval else null end) on conflict(organization_id,user_id) do update set email=excluded.email,enabled=excluded.enabled,mode=excluded.mode,digest_minutes=excluded.digest_minutes,minimum_confidence=excluded.minimum_confidence,next_digest_at=case when excluded.mode='digest' then coalesce(ophanim_intelligence_notification_settings.next_digest_at,now()+(excluded.digest_minutes||' minutes')::interval) else null end,updated_at=now()`, [actor.organizationId, actor.userId, email.toLowerCase(), enabled, mode, digestMinutes, minimumConfidence]);
  return getIntelligenceNotificationSettings(actor);
}

export async function intelligenceDashboard(actor: OrganizationActor) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:read');
  const result = await db().query<{ open_alerts: string; logistics_alerts: string; cyber_alerts: string; triage: string; open_tasks: string; overdue_tasks: string; rescue_cases: string; remediation_rooms: string; roll_calls: string; imports: string }>(`select
    (select count(*) from ophanim_intelligence_alerts where organization_id=$1 and alert_status='open')::text as open_alerts,
    (select count(*) from ophanim_intelligence_alerts where organization_id=$1 and alert_category='logistics' and alert_status='open')::text as logistics_alerts,
    (select count(*) from ophanim_intelligence_alerts where organization_id=$1 and alert_category='cyber' and alert_status='open')::text as cyber_alerts,
    (select count(*) from ophanim_intelligence_reviews where organization_id=$1 and review_status in ('new','needs_triage','under_review'))::text as triage,
    (select count(*) from ophanim_operational_tasks where organization_id=$1 and task_status in ('open','in_progress','blocked'))::text as open_tasks,
    (select count(*) from ophanim_operational_tasks where organization_id=$1 and task_status in ('open','in_progress','blocked') and due_at < now())::text as overdue_tasks,
    (select count(*) from ophanim_rescue_cases where organization_id=$1 and case_status <> 'closed')::text as rescue_cases,
    (select count(*) from ophanim_remediation_rooms where organization_id=$1 and room_status <> 'closed')::text as remediation_rooms,
    (select count(*) from ophanim_zero_day_roll_calls where organization_id=$1 and roll_call_status <> 'closed')::text as roll_calls,
    (select count(*) from ophanim_imports where organization_id=$1 and created_at > now()-interval '30 days')::text as imports`, [actor.organizationId]);
  return Object.fromEntries(Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)]));
}
