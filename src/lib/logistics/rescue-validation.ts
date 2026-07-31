export const RESCUE_CASE_STATUSES = ['open', 'assessing', 'awaiting_approval', 'executing', 'recovered', 'closed'] as const;
export const RESCUE_ACTION_TYPES = ['reroute', 'rebook', 'hold', 'carrier_contact', 'port_contact', 'customs', 'customer_update', 'procurement', 'other'] as const;
export const RESCUE_ACTION_STATUSES = ['proposed', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled'] as const;
export const RESCUE_DECISIONS = ['approved', 'rejected', 'hold', 'note'] as const;
export const RESCUE_EVIDENCE_TYPES = ['source', 'carrier_notice', 'customer_notice', 'quote', 'approval', 'document', 'other'] as const;

export type RescueCaseStatus = (typeof RESCUE_CASE_STATUSES)[number];
export type RescueActionType = (typeof RESCUE_ACTION_TYPES)[number];
export type RescueActionStatus = (typeof RESCUE_ACTION_STATUSES)[number];
export type RescueDecision = (typeof RESCUE_DECISIONS)[number];
export type RescueEvidenceType = (typeof RESCUE_EVIDENCE_TYPES)[number];

export interface RescueCaseInput { shipmentId: string; disruptionId?: string; impactAssessmentId?: string; objective: string; summary?: string; }
export interface RescueActionInput { actionType: RescueActionType; title: string; description?: string; targetAt?: string; }
export interface RescueDecisionInput { actionId?: string; decision: RescueDecision; rationale: string; }
export interface RescueEvidenceInput { actionId?: string; evidenceType: RescueEvidenceType; title: string; sourceUrl: string; description?: string; }

export class RescueValidationError extends Error { constructor(message: string) { super(message); this.name = 'RescueValidationError'; } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RescueValidationError('Input must be an object.'); return value as Record<string, unknown>; }
function text(value: unknown, field: string, required = false, maxLength = 300): string | undefined { if (value === undefined || value === null || value === '') { if (required) throw new RescueValidationError(`${field} is required.`); return undefined; } if (typeof value !== 'string') throw new RescueValidationError(`${field} must be text.`); const result = value.trim(); if (!result && required) throw new RescueValidationError(`${field} is required.`); if (result.length > maxLength) throw new RescueValidationError(`${field} must be ${maxLength} characters or fewer.`); return result || undefined; }
function uuid(value: unknown, field: string, required = false): string | undefined { const result = text(value, field, required, 36); if (result && !UUID.test(result)) throw new RescueValidationError(`${field} is invalid.`); return result; }
function timestamp(value: unknown, field: string): string | undefined { const result = text(value, field, false, 64); if (result && !Number.isFinite(Date.parse(result))) throw new RescueValidationError(`${field} must be a valid timestamp.`); return result; }
function url(value: unknown): string { const result = text(value, 'Source URL', true, 2048)!; try { const parsed = new URL(result); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); } catch { throw new RescueValidationError('Source URL must be an HTTP(S) URL.'); } return result; }
function enumValue<T extends readonly string[]>(value: unknown, field: string, values: T): T[number] { const result = text(value, field, true, 64); if (!result || !values.includes(result)) throw new RescueValidationError(`${field} is invalid.`); return result as T[number]; }

export function validateRescueCaseInput(value: unknown): RescueCaseInput { const input = object(value); return { shipmentId: uuid(input.shipmentId, 'Shipment ID', true)!, disruptionId: uuid(input.disruptionId, 'Disruption ID'), impactAssessmentId: uuid(input.impactAssessmentId, 'Impact assessment ID'), objective: text(input.objective, 'Objective', true, 1000)!, summary: text(input.summary, 'Summary', false, 4000) }; }
export function validateRescueActionInput(value: unknown): RescueActionInput { const input = object(value); return { actionType: enumValue(input.actionType, 'Action type', RESCUE_ACTION_TYPES), title: text(input.title, 'Action title', true)!, description: text(input.description, 'Description', false, 4000), targetAt: timestamp(input.targetAt, 'Target time') }; }
export function validateRescueDecisionInput(value: unknown): RescueDecisionInput { const input = object(value); return { actionId: uuid(input.actionId, 'Action ID'), decision: enumValue(input.decision, 'Decision', RESCUE_DECISIONS), rationale: text(input.rationale, 'Rationale', true, 4000)! }; }
export function validateRescueEvidenceInput(value: unknown): RescueEvidenceInput { const input = object(value); return { actionId: uuid(input.actionId, 'Action ID'), evidenceType: enumValue(input.evidenceType, 'Evidence type', RESCUE_EVIDENCE_TYPES), title: text(input.title, 'Evidence title', true)!, sourceUrl: url(input.sourceUrl), description: text(input.description, 'Description', false, 4000) }; }
export function validateRescueCaseStatus(value: unknown): RescueCaseStatus { return enumValue(value, 'Case status', RESCUE_CASE_STATUSES); }
