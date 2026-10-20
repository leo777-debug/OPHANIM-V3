import { db } from '@/lib/db/pool';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';

export class ForecastInputError extends Error {}
export type ForecastInput = { question: string; horizon: string; probability: number; sourceUrl: string; rationale: string };
export type Forecast = ForecastInput & { id: string; createdAt: string; outcome: boolean | null; outcomeSourceUrl: string | null; resolvedAt: string | null; brierScore: number | null };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function sourceLink(value: unknown) {
  try { const url = new URL(String(value)); if (url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 2000) return url.href; } catch { /* Return field error below. */ }
  throw new ForecastInputError('Provide an HTTPS source link without embedded credentials.');
}
export function parseForecast(value: unknown, now = Date.now()): ForecastInput {
  const input = object(value), question = typeof input.question === 'string' ? input.question.trim() : '';
  if (question.length < 10 || question.length > 500) throw new ForecastInputError('Question must contain 10–500 characters.');
  const horizon = typeof input.horizon === 'string' ? Date.parse(input.horizon) : NaN;
  if (!Number.isFinite(horizon) || horizon <= now || horizon > now + 2 * 366 * 86400000) throw new ForecastInputError('Horizon must be in the future, within two years.');
  if (typeof input.probability !== 'number' || !Number.isFinite(input.probability) || input.probability < 0 || input.probability > 1) throw new ForecastInputError('Probability must be between 0 and 1.');
  if (input.rationale !== undefined && (typeof input.rationale !== 'string' || input.rationale.length > 4000)) throw new ForecastInputError('Rationale must contain at most 4,000 characters.');
  return { question, horizon: new Date(horizon).toISOString(), probability: Math.round(input.probability * 10000) / 10000, sourceUrl: sourceLink(input.sourceUrl), rationale: typeof input.rationale === 'string' ? input.rationale.trim() : '' };
}
export function brierScore(probability: number, outcome: boolean): number {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new ForecastInputError('Invalid probability.');
  return (probability - Number(outcome)) ** 2;
}
type Row = { id: string; question: string; horizon: string; probability: number | string; source_url: string; rationale: string; created_at: string; outcome: boolean | null; outcome_source_url: string | null; resolved_at: string | null };
const columns = 'id,question,horizon,probability,source_url,rationale,created_at,outcome,outcome_source_url,resolved_at';
function record(row: Row): Forecast {
  return { id: row.id, question: row.question, horizon: new Date(row.horizon).toISOString(), probability: Number(row.probability), sourceUrl: row.source_url, rationale: row.rationale, createdAt: new Date(row.created_at).toISOString(), outcome: row.outcome, outcomeSourceUrl: row.outcome_source_url, resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null, brierScore: row.outcome === null ? null : brierScore(Number(row.probability), row.outcome) };
}
export async function listForecasts(actor: OrganizationActor) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:read');
  const result = await db().query<Row>(`select ${columns} from ophanim_forecasts where organization_id=$1 order by created_at desc,id limit 200`, [actor.organizationId]);
  return result.rows.map(record);
}
export async function createForecast(actor: OrganizationActor, value: unknown) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write'); const input = parseForecast(value);
  const result = await db().query<Row>(`insert into ophanim_forecasts(organization_id,created_by,question,horizon,probability,source_url,rationale) values($1,$2,$3,$4,$5,$6,$7) returning ${columns}`, [actor.organizationId, actor.userId, input.question, input.horizon, input.probability, input.sourceUrl, input.rationale]);
  return record(result.rows[0]);
}
export async function resolveForecast(actor: OrganizationActor, value: unknown) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write'); const input = object(value);
  if (typeof input.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.id) || typeof input.outcome !== 'boolean') throw new ForecastInputError('A forecast ID and boolean outcome are required.');
  const result = await db().query<Row>(`update ophanim_forecasts set outcome=$3,outcome_source_url=$4,resolved_at=now() where id=$1 and organization_id=$2 and outcome is null and horizon <= now() returning ${columns}`, [input.id, actor.organizationId, input.outcome, sourceLink(input.sourceUrl)]);
  if (!result.rows[0]) throw new ForecastInputError('Forecast unavailable, already resolved, or its horizon has not passed.');
  return record(result.rows[0]);
}
