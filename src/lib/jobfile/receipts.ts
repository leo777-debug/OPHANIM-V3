// Paper Risk (rules + logistic) and "Checking our work": calibration, Brier score,
// interval coverage and a simple baseline per prediction type. Rows where a person
// acted on a warning and the problem did not happen (intervention) are excluded.
import { recordPrediction, resolveQuestion, type Forecast, type Outcome, type Question, type Score } from './ledger';
import type { JobAggregate } from './service';
import type { Ctx } from './types';

// ---- Paper Risk -------------------------------------------------------------------
const WEIGHTS: Array<{ label: string; weight: number; test: (aggregate: JobAggregate) => number }> = [
  { label: 'weight differs between documents', weight: 1.1, test: a => Number(a.flags.some(flag => flag.status === 'open' && flag.checkCode === 'weight_mismatch')) },
  { label: 'piece count differs between documents', weight: 1.3, test: a => Number(a.flags.some(flag => flag.status === 'open' && flag.checkCode === 'pieces_mismatch')) },
  { label: 'party names differ between documents', weight: 1.0, test: a => Number(a.flags.some(flag => flag.status === 'open' && /shipper_mismatch|consignee_mismatch/.test(flag.checkCode))) },
  { label: 'HS code looks unusual for the goods', weight: 0.8, test: a => Number(a.flags.some(flag => flag.status === 'open' && flag.checkCode === 'hs_code_plausibility')) },
  { label: 'required document missing', weight: 0.9, test: a => Math.min(2, a.flags.filter(flag => flag.status === 'open' && flag.checkCode === 'missing_document').length) },
  { label: 'invoice arithmetic, currency or VAT problem', weight: 0.7, test: a => Number(a.flags.some(flag => flag.status === 'open' && /invoice_lines_total|currency_inconsistent|vat_sensible/.test(flag.checkCode))) },
  // Values already behind an open flag are counted by that flag, not again here.
  { label: 'values still waiting for confirmation', weight: 0.3, test: a => { const flagged = new Set(a.flags.filter(flag => flag.status === 'open').flatMap(flag => (flag.details?.fields ?? []).map(field => `${field.documentId}:${field.field}`)));
    return Math.min(3, a.documents.filter(document => document.fields?.some(field => field.status === 'suggested' && field.field !== 'invoice_lines' && !flagged.has(`${document.id}:${field.field}`))).length); } },
];
export const PAPER_RISK_INTERCEPT = -2.2;
/** Odds that the paperwork leads to a customs query, amendment, rejection or invoice dispute, with the top reasons. */
export function paperRisk(aggregate: JobAggregate) {
  const reasons = WEIGHTS.map(item => ({ label: item.label, contribution: Math.round(item.weight * item.test(aggregate) * 100) / 100 })).filter(item => item.contribution > 0).sort((a, b) => b.contribution - a.contribution);
  const logit = PAPER_RISK_INTERCEPT + reasons.reduce((sum, item) => sum + item.contribution, 0);
  return { probability: Math.round(1 / (1 + Math.exp(-logit)) * 1000) / 1000, reasons: reasons.slice(0, 3), oneIn: Math.max(1, Math.round(1 + Math.exp(-logit))) };
}
export async function recordPaperRisk(ctx: Ctx, aggregate: JobAggregate) {
  const risk = paperRisk(aggregate);
  await recordPrediction(ctx, { questionType: 'paper_risk', outcomeKind: 'binary', subjectKey: `paper:${aggregate.job.id}`, jobFileId: aggregate.job.id,
    textEn: `${aggregate.job.jobNumber}: paperwork leads to a customs query, amendment, rejection or invoice dispute`, textAr: `${aggregate.job.jobNumber}: المستندات تؤدي إلى استفسار جمركي أو تعديل أو رفض أو اعتراض على الفاتورة`,
    probability: risk.probability, modelVersion: 'paper-risk@1', inputs: { reasons: risk.reasons, intercept: PAPER_RISK_INTERCEPT }, drivers: risk.reasons, rulesFired: risk.reasons.map(reason => reason.label), trigger: 'checks' });
  return risk;
}
/** A query/amendment/rejection/dispute resolves Paper Risk as yes; delivery without one resolves it as no. */
export const resolvePaperRisk = (ctx: Ctx, jobFileId: string, happened: boolean, evidence: Record<string, unknown> = {}) =>
  resolveQuestion(ctx, `paper:${jobFileId}`, { bool: happened, source: happened ? 'query_received' : 'milestone', evidence }, jobFileId);

// ---- Checking our work -------------------------------------------------------------
export type Calibration = {
  questionType: string; resolved: number; excluded: number; brier: number | null; logLoss: number | null; baselineBrier: number | null; baseRate: number | null;
  bins: Array<{ from: number; to: number; n: number; meanPredicted: number; observed: number }>; coverage: number | null; intervals: number;
};
type CalibrationRow = { probability: number | null; outcome: boolean | null; intervention: boolean; score: Pick<Score, 'brier' | 'logLoss' | 'intervalHit'> | null };
export function calibrate(rows: CalibrationRow[], questionType: string, binCount = 10): Calibration {
  const included = rows.filter(row => !row.intervention && row.score), excluded = rows.filter(row => row.intervention).length;
  const binary = included.filter(row => row.probability !== null && row.outcome !== null && row.score!.brier !== null);
  const intervals = included.filter(row => row.score!.intervalHit !== null);
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const baseRate = mean(binary.map(row => Number(row.outcome)));
  const bins = Array.from({ length: binCount }, (_, index) => {
    const from = index / binCount, to = (index + 1) / binCount, members = binary.filter(row => row.probability! >= from && (row.probability! < to || (index === binCount - 1 && row.probability! <= 1)));
    return { from, to, n: members.length, meanPredicted: mean(members.map(row => row.probability!)) ?? 0, observed: mean(members.map(row => Number(row.outcome))) ?? 0 };
  }).filter(bin => bin.n > 0);
  const round = (value: number | null, digits = 4) => value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;
  return { questionType, resolved: binary.length + intervals.length, excluded, brier: round(mean(binary.map(row => Number(row.score!.brier)))), logLoss: round(mean(binary.map(row => Number(row.score!.logLoss)))),
    // Baseline: always predicting the observed base rate.
    baselineBrier: baseRate === null ? null : round(mean(binary.map(row => (baseRate - Number(row.outcome)) ** 2))), baseRate: round(baseRate), bins,
    coverage: intervals.length ? round(intervals.filter(row => row.score!.intervalHit).length / intervals.length) : null, intervals: intervals.length };
}
/** Reads The Panel's ledger directly, so it works with or without the forecast worker. */
export async function checkingOurWork(ctx: Ctx) {
  const org = ctx.actor.organizationId;
  const [questions, forecasts, scores, outcomes] = await Promise.all([
    ctx.repo.select<Question>('ophanim_forecast_questions', org, { status: 'resolved' }, { limit: 20000 }),
    ctx.repo.select<Forecast>('ophanim_forecasts', org, {}, { limit: 20000 }),
    ctx.repo.select<Score>('ophanim_forecast_scores', org, {}, { limit: 20000 }),
    ctx.repo.select<Outcome>('ophanim_forecast_outcomes', org, {}, { limit: 20000 }),
  ]);
  const byQuestion = new Map(questions.map(question => [question.id, question])), byOutcome = new Map(outcomes.map(outcome => [outcome.questionId, outcome])), byForecast = new Map(scores.map(score => [score.forecastId, score]));
  const rows = forecasts.flatMap(forecast => {
    const question = byQuestion.get(forecast.questionId), outcome = question && byOutcome.get(question.id);
    // Analyst (human) forecasts are shown on their own page.
    if (!question || !outcome || forecast.sourceType === 'human') return [];
    return [{ questionType: question.questionType, probability: forecast.probability, outcome: outcome.outcome, intervention: outcome.intervention, score: byForecast.get(forecast.id) ?? null }];
  });
  const types = [...new Set(rows.map(row => row.questionType))].sort();
  return types.map(type => calibrate(rows.filter(row => row.questionType === type), type));
}
