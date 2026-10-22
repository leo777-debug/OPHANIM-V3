// Job-file predictions in The Panel's ledger (db/migrations/025_forecast_panel.sql).
// One ledger for everything: questions, inputs snapshots, append-only forecasts,
// immutable outcomes and scores. Each job file is linked to an ophanim_shipments row
// so its predictions sit beside the Panel's own. Rule-based predictions use
// source_type 'rule'; their rule version and inputs hash live in `trigger`.
import { createHash } from 'node:crypto';
import type { Ctx, JobFile } from './types';

export type QuestionType = 'ghost_position' | 'time_gap_risk' | 'weather_impact' | 'payment_date' | 'dispute_odds' | 'paper_risk' | 'arrives_by' | 'clears_customs_by' | 'delay_over_days' | 'eta_distribution' | 'sanctions_exposure' | 'congestion' | 'demurrage';
export type OutcomeKind = 'binary' | 'interval' | 'timestamp';
export type SourceType = 'rule' | 'ensemble' | 'component_model' | 'analog' | 'base_rate' | 'carrier_eta' | 'human';
export type Question = { id: string; shipmentId: string; questionType: QuestionType; questionText: string; threshold: Record<string, unknown> & { subject?: string; jobFileId?: string; outcomeKind?: OutcomeKind; textAr?: string }; resolveBy: string; status: 'open' | 'resolved' | 'void'; createdAt: string };
export type Forecast = { id: string; shipmentId: string; questionId: string; sourceType: SourceType; probability: number | null; p10At: string | null; p50At: string | null; p90At: string | null; baseRate: number | null; drivers: unknown[]; rulesFired: unknown[];
  featureSnapshotId: string; trigger: { cause?: string; modelVersion?: string; inputsHash?: string; prediction?: Record<string, unknown> | null }; issuedAt: string };
export type Outcome = { id: string; questionId: string; outcome: boolean | null; actualAt: string | null; resolvedAt: string; resolutionSource: string; evidence: Record<string, unknown>; intervention: boolean };
export type Score = { forecastId: string; brier: number | null; logLoss: number | null; intervalHit: boolean | null; absErrorHours: number | null; scoredAt: string };
export type Interaction = { id: string; forecastId: string; kind: 'shown' | 'acted' | 'dismissed'; action: string | null; userId: string | null; createdAt: string };

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as object).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
export const inputsHash = (inputs: unknown) => createHash('sha256').update(canonical(inputs)).digest('hex');
export const brier = (probability: number, outcome: boolean) => (probability - Number(outcome)) ** 2;
export const logLoss = (probability: number, outcome: boolean) => { const p = Math.min(1 - 1e-6, Math.max(1e-6, probability)); return -(outcome ? Math.log(p) : Math.log(1 - p)); };
const org = (ctx: Ctx) => ctx.actor.organizationId;
const clock = (ctx: Ctx) => ctx.now?.() ?? Date.now();

/** Every job file gets one shipment row (created once, then kept in step) so it can join the Panel ledger, Route Lens and Deep Watch. */
export async function ensureJobShipment(ctx: Ctx, jobFileId: string): Promise<string> {
  const [job] = await ctx.repo.select<JobFile>('ophanim_job_files', org(ctx), { id: jobFileId });
  if (!job) throw new Error('Job file not found.');
  const references = await ctx.repo.select<{ type: string; normalizedValue: string; validated: boolean }>('ophanim_job_references', org(ctx), { jobFileId, validated: true });
  const ref = (type: string) => references.find(item => item.type === type)?.normalizedValue ?? null;
  const fields = { originPortName: job.origin, destinationPortName: job.destination, plannedDepartureAt: job.plannedDepartureAt, plannedArrivalAt: job.plannedArrivalAt,
    containerNumber: ref('container'), billOfLadingReference: ref('bl') ?? ref('hbl'), bookingNumber: ref('booking') };
  if (job.shipmentId) { await ctx.repo.update('ophanim_shipments', org(ctx), { id: job.shipmentId }, fields); return job.shipmentId; }
  const [existing] = await ctx.repo.select<{ id: string }>('ophanim_shipments', org(ctx), { shipmentReference: job.jobNumber });
  const shipmentId = existing?.id ?? (await ctx.repo.insert<{ id: string }>('ophanim_shipments', org(ctx), { shipmentReference: job.jobNumber, ...fields, metadata: { jobFileId, source: 'job_file' } })).id;
  if (existing) await ctx.repo.update('ophanim_shipments', org(ctx), { id: shipmentId }, fields);
  await ctx.repo.update('ophanim_job_files', org(ctx), { id: jobFileId }, { shipmentId });
  return shipmentId;
}

export type PredictionInput = {
  questionType: QuestionType; outcomeKind: OutcomeKind; subjectKey: string; textEn: string; textAr?: string; jobFileId?: string | null; shipmentId?: string | null; resolveBy?: string | null; threshold?: Record<string, unknown>;
  probability?: number | null; prediction?: Record<string, unknown> | null; p10At?: string | null; p50At?: string | null; p90At?: string | null; baseRate?: number | null;
  sourceType?: SourceType; modelVersion: string; inputs: Record<string, unknown>; drivers?: unknown[]; rulesFired?: unknown[]; trigger?: string;
};

async function questionsFor(ctx: Ctx, shipmentId: string, questionType?: QuestionType) {
  return ctx.repo.select<Question>('ophanim_forecast_questions', org(ctx), { shipmentId, ...(questionType ? { questionType } : {}) });
}
/** Ghost Position asks "had it already happened by this time?": one question per estimate, so the generic Brier score is right. */
const subjectFor = (input: PredictionInput, issuedAt: string) => input.questionType === 'ghost_position' ? `${input.subjectKey}@${issuedAt.slice(0, 13)}` : input.subjectKey;

/** Record a prediction when it is made. A new row only when inputs change, so page views do not flood the ledger. */
export async function recordPrediction(ctx: Ctx, input: PredictionInput): Promise<{ question: Question; forecast: Forecast; created: boolean }> {
  const shipmentId = input.shipmentId ?? (input.jobFileId ? await ensureJobShipment(ctx, input.jobFileId) : null);
  if (!shipmentId) throw new Error('A prediction needs a job file or shipment.');
  const issued = clock(ctx), issuedAt = new Date(issued).toISOString(), subject = subjectFor(input, issuedAt);
  let question = (await questionsFor(ctx, shipmentId, input.questionType)).find(item => item.threshold.subject === subject);
  question ??= await ctx.repo.insert<Question>('ophanim_forecast_questions', org(ctx), {
    shipmentId, questionType: input.questionType, questionText: input.textEn.slice(0, 500), resolveBy: input.resolveBy ?? new Date(issued + 30 * 864e5).toISOString(), status: 'open',
    threshold: { ...input.threshold, subject, subjectKey: input.subjectKey, jobFileId: input.jobFileId ?? null, outcomeKind: input.outcomeKind, textAr: input.textAr ?? null, ...(input.questionType === 'ghost_position' ? { asOf: issuedAt } : {}) },
  });
  const sourceType = input.sourceType ?? 'rule', hash = inputsHash({ inputs: input.inputs, modelVersion: input.modelVersion, sourceType });
  const [latest] = await ctx.repo.select<Forecast>('ophanim_forecasts', org(ctx), { questionId: question.id }, { order: 'issuedAt desc', limit: 1 });
  if (latest && (latest.trigger.inputsHash === hash || question.status !== 'open')) return { question, forecast: latest, created: false };
  if (question.status !== 'open' || Date.parse(question.resolveBy) <= issued) return { question, forecast: latest!, created: false };
  // Issue times strictly increase per question, so "latest" is never ambiguous.
  const at = latest && Date.parse(latest.issuedAt) >= issued ? new Date(Date.parse(latest.issuedAt) + 1).toISOString() : issuedAt;
  const snapshot = await ctx.repo.insert<{ id: string }>('ophanim_feature_snapshots', org(ctx), { shipmentId, asOf: at, featureSetVersion: input.modelVersion, features: { ...input.inputs, inputs_hash: hash, job_file_id: input.jobFileId ?? null } });
  const forecast = await ctx.repo.insert<Forecast>('ophanim_forecasts', org(ctx), {
    shipmentId, questionId: question.id, sourceType, userId: null, probability: input.probability ?? null, p10At: input.p10At ?? null, p50At: input.p50At ?? null, p90At: input.p90At ?? null, baseRate: input.baseRate ?? null,
    drivers: input.drivers ?? [], analogs: [], rulesFired: input.rulesFired ?? [], featureSnapshotId: snapshot.id, issuedAt: at,
    trigger: { cause: input.trigger ?? 'job_file', modelVersion: input.modelVersion, inputsHash: hash, prediction: input.prediction ?? null },
  });
  return { question, forecast, created: true };
}

export async function recordInteraction(ctx: Ctx, forecastId: string, kind: Interaction['kind'], action: string | null = null) {
  return ctx.repo.insert<Interaction>('ophanim_forecast_interactions', org(ctx), { forecastId, kind, action, userId: ctx.actor.demo || ctx.actor.system ? null : ctx.actor.userId });
}
export async function markShown(ctx: Ctx, forecastIds: string[]) {
  if (!forecastIds.length) return;
  const seen = new Set((await ctx.repo.select<Interaction>('ophanim_forecast_interactions', org(ctx), { forecastId: forecastIds, kind: 'shown' })).map(item => item.forecastId));
  for (const id of forecastIds) if (!seen.has(id)) await recordInteraction(ctx, id, 'shown');
}
/** The latest forecast on a job-file subject (e.g. a time-gap warning shown on the Today list). */
export async function latestForecastFor(ctx: Ctx, jobFileId: string, subjectKey: string) {
  const [job] = await ctx.repo.select<JobFile>('ophanim_job_files', org(ctx), { id: jobFileId });
  if (!job?.shipmentId) return null;
  const question = (await questionsFor(ctx, job.shipmentId)).find(item => item.threshold.subjectKey === subjectKey);
  if (!question) return null;
  const [forecast] = await ctx.repo.select<Forecast>('ophanim_forecasts', org(ctx), { questionId: question.id }, { order: 'issuedAt desc', limit: 1 });
  return forecast ?? null;
}

export type OutcomeInput = { bool?: boolean; at?: string; source: 'milestone' | 'shipment_event' | 'actual_arrival' | 'invoice_paid' | 'query_received' | 'weather_observed' | 'manual'; evidence?: Record<string, unknown> };
/**
 * Resolve every open question for a job-file subject, then score its forecasts with the same
 * formula the forecast worker uses (idempotent; the worker's cycle may also score them).
 * A warning someone acted on whose problem did not happen is marked as an intervention and not scored.
 */
export async function resolveQuestion(ctx: Ctx, subjectKey: string, outcome: OutcomeInput, jobFileId?: string) {
  const job = jobFileId ? (await ctx.repo.select<JobFile>('ophanim_job_files', org(ctx), { id: jobFileId }))[0] : null;
  const candidates = job?.shipmentId ? await questionsFor(ctx, job.shipmentId) : await ctx.repo.select<Question>('ophanim_forecast_questions', org(ctx), { status: 'open' }, { limit: 2000 });
  const open = candidates.filter(question => question.status === 'open' && question.threshold.subjectKey === subjectKey);
  const resolved: Outcome[] = [];
  for (const question of open) {
    const forecasts = await ctx.repo.select<Forecast>('ophanim_forecasts', org(ctx), { questionId: question.id });
    // Ghost Position: did it happen by the time we said it probably had?
    const value = question.questionType === 'ghost_position' && outcome.at && typeof question.threshold.asOf === 'string' ? Date.parse(outcome.at) <= Date.parse(question.threshold.asOf) : outcome.bool ?? null;
    const acted = forecasts.length ? (await ctx.repo.select<Interaction>('ophanim_forecast_interactions', org(ctx), { forecastId: forecasts.map(item => item.id), kind: 'acted' })).length > 0 : false;
    const intervention = acted && value === false;
    const row = await ctx.repo.insert<Outcome>('ophanim_forecast_outcomes', org(ctx), { questionId: question.id, outcome: value, actualAt: outcome.at ?? null, resolvedAt: new Date(clock(ctx)).toISOString(),
      resolutionSource: outcome.source, reviewerUserId: outcome.source === 'manual' && !ctx.actor.demo ? ctx.actor.userId : null, evidence: { ...outcome.evidence, subjectKey }, intervention });
    await ctx.repo.update('ophanim_forecast_questions', org(ctx), { id: question.id }, { status: 'resolved' });
    if (!intervention) for (const forecast of forecasts) {
      if ((await ctx.repo.select('ophanim_forecast_scores', org(ctx), { forecastId: forecast.id })).length) continue;
      await ctx.repo.insert('ophanim_forecast_scores', org(ctx), { forecastId: forecast.id, ...scoreForecast(forecast, row) });
    }
    resolved.push(row);
  }
  return resolved[0] ?? null;
}

/** Same scoring as the forecast worker: Brier/log loss for yes/no; interval hit and absolute error for ranges. */
export function scoreForecast(forecast: Pick<Forecast, 'probability' | 'p10At' | 'p50At' | 'p90At'>, outcome: Pick<Outcome, 'outcome' | 'actualAt'>): Omit<Score, 'forecastId' | 'scoredAt'> {
  const binary = outcome.outcome !== null && forecast.probability !== null;
  const actual = outcome.actualAt ? Date.parse(outcome.actualAt) : null;
  return {
    brier: binary ? Math.round(brier(forecast.probability!, outcome.outcome!) * 1e6) / 1e6 : null,
    logLoss: binary ? Math.round(logLoss(forecast.probability!, outcome.outcome!) * 1e6) / 1e6 : null,
    absErrorHours: actual !== null && forecast.p50At ? Math.round(Math.abs(actual - Date.parse(forecast.p50At)) / 36e3) / 100 : null,
    intervalHit: actual !== null && forecast.p10At && forecast.p90At ? actual >= Date.parse(forecast.p10At) && actual <= Date.parse(forecast.p90At) : null,
  };
}

/** Latest forecast per question for a job, with its result for the Receipts strip. */
export async function jobPredictions(ctx: Ctx, jobFileId: string) {
  const [job] = await ctx.repo.select<JobFile>('ophanim_job_files', org(ctx), { id: jobFileId });
  if (!job?.shipmentId) return [];
  const questions = (await questionsFor(ctx, job.shipmentId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!questions.length) return [];
  const forecasts = await ctx.repo.select<Forecast>('ophanim_forecasts', org(ctx), { questionId: questions.map(item => item.id) }, { order: 'issuedAt desc' });
  const outcomes = await ctx.repo.select<Outcome>('ophanim_forecast_outcomes', org(ctx), { questionId: questions.map(item => item.id) });
  const scores = await ctx.repo.select<Score>('ophanim_forecast_scores', org(ctx), { forecastId: forecasts.map(item => item.id) });
  // Show one row per subject: the newest ghost estimate, not every hourly one.
  const latestBySubject = new Map<string, Question>();
  for (const question of questions) latestBySubject.set(String(question.threshold.subjectKey ?? question.id), question);
  return [...latestBySubject.values()].flatMap(question => {
    const forecast = forecasts.find(item => item.questionId === question.id && item.sourceType !== 'human');
    if (!forecast) return [];
    const outcome = outcomes.find(item => item.questionId === question.id), score = scores.find(item => item.forecastId === forecast.id);
    const status = !outcome ? 'pending' : outcome.intervention ? 'excluded' : !score ? 'pending' : score.intervalHit !== null ? (score.intervalHit ? 'called' : 'missed') : score.brier !== null ? (score.brier < 0.25 ? 'called' : 'missed') : 'pending';
    const summary = forecast.probability !== null ? `${Math.round(forecast.probability * 100)}%` : forecast.p10At && forecast.p90At ? `${forecast.p10At.slice(0, 10)} – ${forecast.p90At.slice(0, 10)}` : '';
    return [{ id: forecast.id, questionId: question.id, questionType: question.questionType, textEn: question.questionText, textAr: question.threshold.textAr ?? null, madeAt: forecast.issuedAt, summary, modelVersion: forecast.trigger.modelVersion ?? null, drivers: forecast.drivers, status,
      scoreLabel: score?.brier !== null && score?.brier !== undefined ? `Brier ${score.brier.toFixed(3)}` : score?.intervalHit !== null && score?.intervalHit !== undefined ? (score.intervalHit ? 'inside range' : 'outside range') : undefined }];
  });
}
