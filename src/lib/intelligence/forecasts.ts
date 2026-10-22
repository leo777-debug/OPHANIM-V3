import { db } from '@/lib/db/pool';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';

// Analyst probabilities on public operational questions, stored in The Panel's single
// ledger: question (type public_question, no shipment) → human forecast → sourced
// outcome → score. The question, probability, rationale and evidence are immutable.
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

type Row = { id: string; question_text: string; resolve_by: Date | string; created_at: Date | string; probability: number | string | null; trigger: { sourceUrl?: string; reasoning?: string } | null; outcome: boolean | null; evidence: { url?: string } | null; resolved_at: Date | string | null };
const iso = (value: Date | string | null) => value === null ? null : new Date(value).toISOString();
function record(row: Row): Forecast {
  const probability = Number(row.probability ?? 0);
  return { id: row.id, question: row.question_text, horizon: iso(row.resolve_by)!, probability, sourceUrl: row.trigger?.sourceUrl ?? '', rationale: row.trigger?.reasoning ?? '', createdAt: iso(row.created_at)!,
    outcome: row.outcome, outcomeSourceUrl: row.evidence?.url ?? null, resolvedAt: iso(row.resolved_at), brierScore: row.outcome === null ? null : brierScore(probability, row.outcome) };
}
// The original analyst forecast is the first human forecast on the question; later ones are new rows, never edits.
const select = `select q.id, q.question_text, q.resolve_by, q.created_at, f.probability, f.trigger, o.outcome, o.evidence, o.resolved_at
  from ophanim_forecast_questions q
  join lateral (select probability, trigger from ophanim_forecasts where organization_id = q.organization_id and question_id = q.id and source_type = 'human' order by issued_at limit 1) f on true
  left join ophanim_forecast_outcomes o on o.organization_id = q.organization_id and o.question_id = q.id
 where q.organization_id = $1 and q.question_type = 'public_question'`;

export async function listForecasts(actor: OrganizationActor) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:read');
  const result = await db().query<Row>(`${select} order by q.created_at desc, q.id limit 200`, [actor.organizationId]);
  return result.rows.map(record);
}
export async function createForecast(actor: OrganizationActor, value: unknown) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write'); const input = parseForecast(value);
  const question = await db().query<{ id: string }>(`insert into ophanim_forecast_questions(organization_id,shipment_id,question_type,question_text,threshold,resolve_by) values($1,null,'public_question',$2,$3,$4) returning id`,
    [actor.organizationId, input.question, JSON.stringify({ scope: 'public_question' }), input.horizon]);
  const id = question.rows[0].id;
  const snapshot = await db().query<{ id: string }>(`insert into ophanim_feature_snapshots(organization_id,shipment_id,feature_set_version,features) values($1,null,'analyst-v1',$2) returning id`,
    [actor.organizationId, JSON.stringify({ scope: 'public_question', source_url: input.sourceUrl })]);
  await db().query(`insert into ophanim_forecasts(organization_id,shipment_id,question_id,source_type,user_id,probability,feature_snapshot_id,trigger) values($1,null,$2,'human',$3,$4,$5,$6)`,
    [actor.organizationId, id, actor.userId, input.probability, snapshot.rows[0].id, JSON.stringify({ cause: 'analyst', sourceUrl: input.sourceUrl, reasoning: input.rationale })]);
  return record((await db().query<Row>(`${select} and q.id = $2`, [actor.organizationId, id])).rows[0]);
}
export async function resolveForecast(actor: OrganizationActor, value: unknown) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write'); const input = object(value);
  if (typeof input.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.id) || typeof input.outcome !== 'boolean') throw new ForecastInputError('A forecast ID and boolean outcome are required.');
  const url = sourceLink(input.sourceUrl);
  // One sourced outcome per question, only after its horizon; the outcome row is immutable.
  const inserted = await db().query(`insert into ophanim_forecast_outcomes(organization_id,question_id,outcome,resolution_source,reviewer_user_id,evidence)
    select q.organization_id, q.id, $3, 'manual', $4, $5 from ophanim_forecast_questions q
     where q.id = $1 and q.organization_id = $2 and q.question_type = 'public_question' and q.status = 'open' and q.resolve_by <= now()
    on conflict (question_id) do nothing returning question_id`, [input.id, actor.organizationId, input.outcome, actor.userId, JSON.stringify({ url })]);
  if (!inserted.rowCount) throw new ForecastInputError('Forecast unavailable, already resolved, or its horizon has not passed.');
  await db().query(`update ophanim_forecast_questions set status = 'resolved' where id = $1 and organization_id = $2`, [input.id, actor.organizationId]);
  await db().query(`insert into ophanim_forecast_scores(organization_id,forecast_id,brier,log_loss)
    select f.organization_id, f.id, power(f.probability - ($3::boolean)::int, 2), -(($3::boolean)::int * ln(greatest(0.000001, f.probability)) + (1 - ($3::boolean)::int) * ln(greatest(0.000001, 1 - f.probability)))
      from ophanim_forecasts f where f.organization_id = $2 and f.question_id = $1 and f.probability is not null on conflict (forecast_id) do nothing`, [input.id, actor.organizationId, input.outcome]);
  return record((await db().query<Row>(`${select} and q.id = $2`, [actor.organizationId, input.id])).rows[0]);
}
