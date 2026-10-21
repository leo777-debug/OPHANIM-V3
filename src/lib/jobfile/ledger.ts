// The prediction ledger (shared with The Panel). Every prediction is written when
// made — question, inputs snapshot + hash, model/rule version — and scored when the
// truth arrives. Rows are append-only: a changed prediction is a new row.
import { createHash } from 'node:crypto';
import type { Ctx } from './types';

export type QuestionType = 'ghost_position' | 'time_gap_risk' | 'weather_impact' | 'payment_date' | 'dispute_odds' | 'paper_risk' | 'arrives_by' | 'clears_customs_by' | 'delay_over_days' | 'eta_distribution' | 'sanctions_exposure' | 'congestion_risk' | 'demurrage_risk';
export type OutcomeKind = 'binary' | 'interval' | 'timestamp';
export type SourceType = 'rule' | 'logistic' | 'ensemble' | 'component_model' | 'analog' | 'base_rate' | 'carrier_eta' | 'human';
export type Question = { id: string; jobFileId: string | null; shipmentId: string | null; questionType: QuestionType; outcomeKind: OutcomeKind; textEn: string; textAr: string | null; subjectKey: string; threshold: Record<string, unknown>; resolveBy: string | null; status: 'open' | 'resolved' | 'void'; createdAt: string };
export type Forecast = { id: string; questionId: string; jobFileId: string | null; sourceType: SourceType; predictionType: string; probability: number | null; prediction: Record<string, unknown> | null; p10At: string | null; p50At: string | null; p90At: string | null; baseRate: number | null; drivers: unknown[]; rulesFired: unknown[]; inputsHash: string; featureSnapshotId: string | null; modelVersion: string; trigger: string | null; issuedAt: string; question: string; horizon: string };
export type Outcome = { id: string; questionId: string; outcomeBool: boolean | null; outcomeAt: string | null; outcomeValue: number | null; resolvedAt: string; resolutionSource: string; evidence: Record<string, unknown> };
export type Score = { forecastId: string; questionType: string; brier: number | null; logLoss: number | null; intervalHit: boolean | null; absErrorHours: number | null; excludedReason: 'intervention' | 'void' | null; scoredAt: string };
export type Interaction = { id: string; forecastId: string; kind: 'shown' | 'acted' | 'dismissed'; action: string | null; userId: string | null; createdAt: string };

/** Canonical JSON (sorted keys) so the same inputs always hash the same. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as object).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
export const inputsHash = (inputs: unknown) => createHash('sha256').update(canonical(inputs)).digest('hex');

export const brier = (probability: number, outcome: boolean) => (probability - Number(outcome)) ** 2;
export const logLoss = (probability: number, outcome: boolean) => { const p = Math.min(1 - 1e-6, Math.max(1e-6, probability)); return -(outcome ? Math.log(p) : Math.log(1 - p)); };

export type PredictionInput = {
  questionType: QuestionType; outcomeKind: OutcomeKind; subjectKey: string; textEn: string; textAr?: string; jobFileId?: string | null; shipmentId?: string | null; resolveBy?: string | null; threshold?: Record<string, unknown>;
  probability?: number | null; prediction?: Record<string, unknown> | null; p10At?: string | null; p50At?: string | null; p90At?: string | null; baseRate?: number | null;
  sourceType?: SourceType; modelVersion: string; inputs: Record<string, unknown>; drivers?: unknown[]; rulesFired?: unknown[]; trigger?: string;
};

/** Record a prediction. A new row is written only when its inputs changed, so page views do not flood the ledger. */
export async function recordPrediction(ctx: Ctx, input: PredictionInput): Promise<{ question: Question; forecast: Forecast; created: boolean }> {
  const org = ctx.actor.organizationId, at = new Date(ctx.now?.() ?? Date.now()).toISOString();
  let [question] = await ctx.repo.select<Question>('ophanim_forecast_questions', org, { subjectKey: input.subjectKey });
  question ??= await ctx.repo.insert<Question>('ophanim_forecast_questions', org, { jobFileId: input.jobFileId ?? null, shipmentId: input.shipmentId ?? null, questionType: input.questionType, outcomeKind: input.outcomeKind, textEn: input.textEn, textAr: input.textAr ?? null, subjectKey: input.subjectKey, threshold: input.threshold ?? {}, resolveBy: input.resolveBy ?? null, status: 'open' });
  const hash = inputsHash({ inputs: input.inputs, modelVersion: input.modelVersion, sourceType: input.sourceType ?? 'rule' });
  const [latest] = await ctx.repo.select<Forecast>('ophanim_forecasts', org, { questionId: question.id, sourceType: input.sourceType ?? 'rule' }, { order: 'issuedAt desc', limit: 1 });
  if (latest && latest.inputsHash === hash) return { question, forecast: latest, created: false };
  if (question.status !== 'open') return { question, forecast: latest!, created: false };
  // Issue times strictly increase per question, so "latest" is never ambiguous.
  const issuedAt = latest && Date.parse(latest.issuedAt) >= Date.parse(at) ? new Date(Date.parse(latest.issuedAt) + 1).toISOString() : at;
  const snapshot = await ctx.repo.insert<{ id: string }>('ophanim_feature_snapshots', org, { jobFileId: input.jobFileId ?? null, shipmentId: input.shipmentId ?? null, asOf: at, featureSetVersion: input.modelVersion, features: input.inputs, inputsHash: hash });
  const forecast = await ctx.repo.insert<Forecast>('ophanim_forecasts', org, {
    questionId: question.id, jobFileId: input.jobFileId ?? null, shipmentId: input.shipmentId ?? null, sourceType: input.sourceType ?? 'rule', predictionType: input.questionType,
    question: input.textEn.padEnd(10, '.').slice(0, 500), horizon: input.resolveBy ?? new Date(Date.parse(at) + 30 * 864e5).toISOString(),
    probability: input.probability === undefined || input.probability === null ? null : Math.round(input.probability * 10000) / 10000, prediction: input.prediction ?? null,
    p10At: input.p10At ?? null, p50At: input.p50At ?? null, p90At: input.p90At ?? null, baseRate: input.baseRate ?? null, drivers: input.drivers ?? [], rulesFired: input.rulesFired ?? [], analogs: [],
    inputsHash: hash, featureSnapshotId: snapshot.id, modelVersion: input.modelVersion, trigger: input.trigger ?? null, issuedAt, rationale: '',
  });
  return { question, forecast, created: true };
}

export async function recordInteraction(ctx: Ctx, forecastId: string, kind: Interaction['kind'], action: string | null = null) {
  return ctx.repo.insert<Interaction>('ophanim_forecast_interactions', ctx.actor.organizationId, { forecastId, kind, action, userId: ctx.actor.demo || ctx.actor.system ? null : ctx.actor.userId });
}
/** "shown" is recorded once per forecast. */
export async function markShown(ctx: Ctx, forecastIds: string[]) {
  if (!forecastIds.length) return;
  const seen = new Set((await ctx.repo.select<Interaction>('ophanim_forecast_interactions', ctx.actor.organizationId, { forecastId: forecastIds, kind: 'shown' })).map(item => item.forecastId));
  for (const id of forecastIds) if (!seen.has(id)) await recordInteraction(ctx, id, 'shown');
}

export type OutcomeInput = { bool?: boolean; at?: string; value?: number; source: 'milestone' | 'shipment_event' | 'actual_arrival' | 'invoice_paid' | 'query_received' | 'weather_observed' | 'delay_cost_invoice' | 'manual'; evidence?: Record<string, unknown> };
/** Resolve a question with what actually happened, then score every forecast on it. */
export async function resolveQuestion(ctx: Ctx, subjectKey: string, outcome: OutcomeInput) {
  const org = ctx.actor.organizationId;
  const [question] = await ctx.repo.select<Question>('ophanim_forecast_questions', org, { subjectKey });
  if (!question || question.status !== 'open') return null;
  const resolved = await ctx.repo.insert<Outcome>('ophanim_forecast_outcomes', org, { questionId: question.id, outcomeBool: outcome.bool ?? null, outcomeAt: outcome.at ?? null, outcomeValue: outcome.value ?? null,
    resolvedAt: new Date(ctx.now?.() ?? Date.now()).toISOString(), resolutionSource: outcome.source, reviewerUserId: outcome.source === 'manual' && !ctx.actor.demo ? ctx.actor.userId : null, evidence: outcome.evidence ?? {} });
  await ctx.repo.update('ophanim_forecast_questions', org, { id: question.id }, { status: 'resolved' });
  const forecasts = await ctx.repo.select<Forecast>('ophanim_forecasts', org, { questionId: question.id });
  const acted = new Set((await ctx.repo.select<Interaction>('ophanim_forecast_interactions', org, { forecastId: forecasts.map(item => item.id), kind: 'acted' })).map(item => item.forecastId));
  for (const forecast of forecasts) await ctx.repo.insert('ophanim_forecast_scores', org, { forecastId: forecast.id, ...scoreForecast(question, forecast, resolved, acted.has(forecast.id)) });
  return resolved;
}

/** Brier/log loss for yes/no; interval coverage and absolute error for ranges. A heeded warning whose problem did not happen is excluded (intervention). */
export function scoreForecast(question: Pick<Question, 'questionType' | 'outcomeKind'>, forecast: Pick<Forecast, 'probability' | 'p10At' | 'p50At' | 'p90At' | 'prediction' | 'issuedAt'>, raw: Pick<Outcome, 'outcomeBool' | 'outcomeAt' | 'outcomeValue'>, acted: boolean): Omit<Score, 'forecastId' | 'scoredAt'> {
  const base = { questionType: question.questionType, brier: null, logLoss: null, intervalHit: null, absErrorHours: null, excludedReason: null } as Omit<Score, 'forecastId' | 'scoredAt'>;
  // Ghost Position asks "had it already happened when we said so?" — judged per forecast.
  const outcome = question.questionType === 'ghost_position' && raw.outcomeAt ? { ...raw, outcomeBool: Date.parse(raw.outcomeAt) <= Date.parse(forecast.issuedAt) } : raw;
  if (question.outcomeKind === 'binary' && forecast.probability !== null && outcome.outcomeBool !== null) {
    const result = { ...base, brier: Math.round(brier(forecast.probability, outcome.outcomeBool) * 1e6) / 1e6, logLoss: Math.round(logLoss(forecast.probability, outcome.outcomeBool) * 1e6) / 1e6 };
    return acted && forecast.probability >= 0.5 && outcome.outcomeBool === false ? { ...result, excludedReason: 'intervention' } : result;
  }
  if (outcome.outcomeAt && forecast.p10At && forecast.p90At) {
    const actual = Date.parse(outcome.outcomeAt), hit = actual >= Date.parse(forecast.p10At) && actual <= Date.parse(forecast.p90At);
    return { ...base, intervalHit: hit, absErrorHours: forecast.p50At ? Math.round(Math.abs(actual - Date.parse(forecast.p50At)) / 36e3) / 100 : null };
  }
  if (outcome.outcomeValue !== null && forecast.prediction && typeof forecast.prediction.p10 === 'number' && typeof forecast.prediction.p90 === 'number') {
    return { ...base, intervalHit: outcome.outcomeValue >= forecast.prediction.p10 && outcome.outcomeValue <= forecast.prediction.p90, absErrorHours: typeof forecast.prediction.p50 === 'number' ? Math.abs(outcome.outcomeValue - forecast.prediction.p50) : null };
  }
  return base;
}

/** Latest forecast per question for a job, with its result for the Receipts strip. */
export async function jobPredictions(ctx: Ctx, jobFileId: string) {
  const org = ctx.actor.organizationId;
  const questions = await ctx.repo.select<Question>('ophanim_forecast_questions', org, { jobFileId }, { order: 'createdAt' });
  if (!questions.length) return [];
  const forecasts = await ctx.repo.select<Forecast>('ophanim_forecasts', org, { questionId: questions.map(item => item.id) }, { order: 'issuedAt desc' });
  const outcomes = await ctx.repo.select<Outcome>('ophanim_forecast_outcomes', org, { questionId: questions.map(item => item.id) });
  const scores = await ctx.repo.select<Score>('ophanim_forecast_scores', org, { forecastId: forecasts.map(item => item.id) });
  return questions.flatMap(question => {
    const forecast = forecasts.find(item => item.questionId === question.id && item.sourceType !== 'human' && !item.prediction?.label_only);
    if (!forecast) return [];
    const outcome = outcomes.find(item => item.questionId === question.id), score = scores.find(item => item.forecastId === forecast.id);
    const status = !outcome || !score ? 'pending' : score.excludedReason ? 'excluded' : score.intervalHit !== null ? (score.intervalHit ? 'called' : 'missed') : score.brier !== null ? (score.brier < 0.25 ? 'called' : 'missed') : 'pending';
    const summary = forecast.probability !== null ? `${Math.round(forecast.probability * 100)}%` : forecast.p10At && forecast.p90At ? `${forecast.p10At.slice(0, 10)} – ${forecast.p90At.slice(0, 10)}` : '';
    return [{ id: forecast.id, questionId: question.id, questionType: question.questionType, textEn: question.textEn, textAr: question.textAr, madeAt: forecast.issuedAt, summary, modelVersion: forecast.modelVersion, drivers: forecast.drivers, status,
      scoreLabel: score?.brier !== null && score?.brier !== undefined ? `Brier ${score.brier.toFixed(3)}` : score?.intervalHit !== null && score?.intervalHit !== undefined ? (score.intervalHit ? 'inside range' : 'outside range') : undefined }];
  });
}
