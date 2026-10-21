// Milestones, the piece-count chain, time gaps and Ghost Position.
import { t } from '@/lib/i18n';
import { makeFlag, type Flag } from './checks';
import { recordPrediction, resolveQuestion } from './ledger';
import { audit, JobFileInputError, saveFlags, userOf, type JobAggregate } from './service';
import { closeTodayItem, upsertTodayItem } from './today';
import type { Ctx, Handoff, JobFile, JobMilestone, JobMode, PieceCount } from './types';
import { HANDOFFS } from './types';

export type TemplateStep = { code: string; labelEn: string; labelAr: string; reporter: 'carrier' | 'airline' | 'terminal' | 'agent' | 'customs' | 'trucker' | 'staff' | 'client'; p10: number; p50: number; p90: number; grace?: number };
const step = (code: string, labelEn: string, labelAr: string, reporter: TemplateStep['reporter'], p10: number, p50: number, p90: number): TemplateStep => ({ code, labelEn, labelAr, reporter, p10, p50, p90 });
// p10/p50/p90 = hours from the previous step. Organization defaults, refined from history.
export const MILESTONE_TEMPLATES: Record<'air_export' | 'air_import' | 'sea' | 'gulf_overland', TemplateStep[]> = {
  air_export: [step('booked', 'Booked', 'تم الحجز', 'staff', 0, 0, 0), step('received_origin', 'Received at origin', 'استلام في المنشأ', 'terminal', 4, 24, 72), step('screened', 'Screened', 'تم الفحص الأمني', 'terminal', 1, 4, 12),
    step('manifested', 'Manifested / loaded', 'مدرج في البيان / محمّل', 'airline', 2, 8, 24), step('departed', 'Departed', 'غادرت', 'airline', 1, 3, 10)],
  air_import: [step('arrived', 'Arrived', 'وصلت', 'airline', 0, 0, 0), step('terminal_received', 'Unloaded and received at terminal', 'تفريغ واستلام في المحطة', 'terminal', 1.5, 3, 5), step('customs_cleared', 'Customs cleared', 'تخليص جمركي', 'customs', 2, 8, 30),
    step('do_issued', 'Delivery order issued', 'إصدار إذن التسليم', 'airline', 0.5, 2, 8), step('collected', 'Collected', 'تم الاستلام', 'trucker', 1, 6, 24), step('delivered', 'Delivered', 'تم التسليم', 'trucker', 1, 4, 12)],
  sea: [step('booked', 'Booked', 'تم الحجز', 'staff', 0, 0, 0), step('gated_in', 'Gated in', 'دخول البوابة', 'terminal', 24, 72, 168), step('loaded', 'Loaded', 'تم التحميل', 'carrier', 12, 48, 120), step('departed', 'Departed', 'غادرت', 'carrier', 2, 12, 48),
    step('arrived', 'Arrived', 'وصلت', 'carrier', 72, 240, 600), step('discharged', 'Discharged', 'تم التفريغ', 'terminal', 6, 24, 72), step('customs_cleared', 'Customs cleared', 'تخليص جمركي', 'customs', 8, 36, 120),
    step('released', 'Released', 'تم الإفراج', 'terminal', 2, 12, 48), step('collected', 'Collected', 'تم الاستلام', 'trucker', 4, 24, 96), step('empty_returned', 'Empty returned', 'إعادة الحاوية الفارغة', 'trucker', 12, 72, 240)],
  gulf_overland: [step('discharged_east_coast', 'Discharged at Khor Fakkan / Fujairah', 'تفريغ في خورفكان / الفجيرة', 'terminal', 0, 0, 0), step('bonded_truck_departed', 'Bonded truck departed', 'مغادرة الشاحنة الجمركية', 'trucker', 4, 24, 72),
    step('border_corridor', 'Border / corridor passed', 'عبور الحدود / الممر', 'trucker', 2, 6, 24), step('arrived_destination', 'Arrived at Jebel Ali or destination', 'الوصول إلى جبل علي أو الوجهة', 'trucker', 2, 5, 12)],
};
export function templateFor(mode: JobMode): TemplateStep[] {
  if (mode === 'air_import') return MILESTONE_TEMPLATES.air_import;
  if (mode === 'air_export') return MILESTONE_TEMPLATES.air_export;
  if (mode === 'road') return MILESTONE_TEMPLATES.gulf_overland;
  if (mode === 'multimodal') return [...MILESTONE_TEMPLATES.sea.slice(0, 6), ...MILESTONE_TEMPLATES.gulf_overland.slice(1), ...MILESTONE_TEMPLATES.sea.slice(6)];
  return MILESTONE_TEMPLATES.sea;
}
async function steps(ctx: Ctx, mode: JobMode) {
  const [custom] = await ctx.repo.select<{ steps: TemplateStep[] }>('ophanim_milestone_templates', ctx.actor.organizationId, { mode }, { shared: true, order: 'version desc', limit: 1 });
  return custom?.steps?.length ? custom.steps : templateFor(mode);
}
export const milestoneLabels = (mode: JobMode, locale: 'en' | 'ar' = 'en') => Object.fromEntries(templateFor(mode).map(item => [item.code, locale === 'ar' ? item.labelAr : item.labelEn]));

export async function ensureMilestones(ctx: Ctx, job: JobFile) {
  const existing = await ctx.repo.select<JobMilestone>('ophanim_job_milestones', ctx.actor.organizationId, { jobFileId: job.id });
  const have = new Set(existing.map(item => item.code));
  const template = await steps(ctx, job.mode);
  for (const [index, item] of template.entries()) if (!have.has(item.code)) await ctx.repo.insert('ophanim_job_milestones', ctx.actor.organizationId, { jobFileId: job.id, code: item.code, sequence: index, needsConfirmation: false });
}

export type MilestoneInput = { code: string; actualAt?: string | null; expectedAt?: string | null; plannedAt?: string | null; source: 'email' | 'document' | 'floor_tap' | 'driver' | 'api' | 'manual' | 'import'; sourceKey?: string | null; reportedAt?: string | null; confidence?: number; evidenceText?: string | null; evidenceDocumentId?: string | null };
export const CONFIRM_BELOW = 0.8;
/** Record a milestone. Low-confidence extractions wait for a one-tap confirmation. */
export async function recordMilestone(ctx: Ctx, jobFileId: string, input: MilestoneInput) {
  const org = ctx.actor.organizationId, [job] = await ctx.repo.select<JobFile>('ophanim_job_files', org, { id: jobFileId });
  if (!job) throw new JobFileInputError('Job file not found.');
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(input.code)) throw new JobFileInputError('Unknown milestone code.');
  await ensureMilestones(ctx, job);
  let [milestone] = await ctx.repo.select<JobMilestone>('ophanim_job_milestones', org, { jobFileId, code: input.code });
  milestone ??= await ctx.repo.insert<JobMilestone>('ophanim_job_milestones', org, { jobFileId, code: input.code, sequence: 99, needsConfirmation: false });
  const confidence = input.confidence ?? 1, needsConfirmation = confidence < CONFIRM_BELOW && Boolean(input.actualAt);
  const reportedAt = input.reportedAt ?? new Date(ctx.now?.() ?? Date.now()).toISOString();
  await ctx.repo.update('ophanim_job_milestones', org, { id: milestone.id }, {
    ...(input.plannedAt !== undefined ? { plannedAt: input.plannedAt } : {}), ...(input.expectedAt !== undefined ? { expectedAt: input.expectedAt } : {}), ...(input.actualAt !== undefined ? { actualAt: input.actualAt } : {}),
    source: input.source, sourceKey: input.sourceKey ?? null, reportedAt, confidence, evidenceText: input.evidenceText?.slice(0, 1000) ?? null, evidenceDocumentId: input.evidenceDocumentId ?? null, needsConfirmation,
  });
  await audit(ctx, 'milestone.recorded', 'job_file', jobFileId, { code: input.code, source: input.source, actualAt: input.actualAt ?? null, confidence, needsConfirmation });
  if (input.actualAt && !needsConfirmation) await onMilestoneConfirmed(ctx, job, input.code, input.actualAt, reportedAt, input.sourceKey ?? null);
  return { needsConfirmation };
}
export async function confirmMilestone(ctx: Ctx, jobFileId: string, code: string) {
  const org = ctx.actor.organizationId, [milestone] = await ctx.repo.select<JobMilestone>('ophanim_job_milestones', org, { jobFileId, code });
  const [job] = await ctx.repo.select<JobFile>('ophanim_job_files', org, { id: jobFileId });
  if (!milestone || !job || !milestone.actualAt) throw new JobFileInputError('Nothing to confirm.');
  await ctx.repo.update('ophanim_job_milestones', org, { id: milestone.id }, { needsConfirmation: false, confidence: 1 });
  await audit(ctx, 'milestone.confirmed', 'job_file', jobFileId, { code });
  await onMilestoneConfirmed(ctx, job, code, milestone.actualAt, milestone.reportedAt ?? milestone.actualAt, milestone.sourceKey);
}

/** A confirmed milestone resolves its ghost/time-gap predictions, closes chasers and teaches report lags and durations. */
async function onMilestoneConfirmed(ctx: Ctx, job: JobFile, code: string, actualAt: string, reportedAt: string, sourceKey: string | null) {
  await resolveQuestion(ctx, `ghost:${job.id}:${code}`, { at: actualAt, bool: true, source: 'milestone', evidence: { code } });
  await resolveQuestion(ctx, `gap:${job.id}:${code}`, { bool: true, source: 'milestone', evidence: { code, actualAt } });
  await closeTodayItem(ctx, `missing:${job.id}:${code}`);
  if (code === 'arrived' && job.plannedArrivalAt) {
    const lateMinutes = (Date.parse(actualAt) - Date.parse(job.plannedArrivalAt)) / 6e4;
    await resolveQuestion(ctx, `weather:${job.id}:arrival`, { bool: lateMinutes >= 60, source: 'actual_arrival', evidence: { plannedArrivalAt: job.plannedArrivalAt, actualAt, lateMinutes: Math.round(lateMinutes) } });
  }
  if (sourceKey) {
    const org = ctx.actor.organizationId, lag = Math.max(0, (Date.parse(reportedAt) - Date.parse(actualAt)) / 36e5);
    const [row] = await ctx.repo.select<{ id: string; lagSamplesHours: number[] }>('ophanim_source_report_lags', org, { sourceKey, milestoneCode: code });
    if (row) await ctx.repo.update('ophanim_source_report_lags', org, { id: row.id }, { lagSamplesHours: [...row.lagSamplesHours, Math.round(lag * 100) / 100].slice(-200) });
    else await ctx.repo.insert('ophanim_source_report_lags', org, { sourceKey, milestoneCode: code, lagSamplesHours: [Math.round(lag * 100) / 100], reportsMilestone: true });
  }
}

// ---- Piece-count chain ----------------------------------------------------------
export function pieceChain(counts: Array<Pick<PieceCount, 'handoff' | 'pieces' | 'weightKg' | 'id'>>, jobId: string, tolerance = { weightKg: 2, weightPct: 0.5 }): Flag[] {
  const ordered = [...counts].sort((a, b) => HANDOFFS.indexOf(a.handoff) - HANDOFFS.indexOf(b.handoff));
  const flags: Flag[] = [], label = (handoff: Handoff) => handoff.replace(/_/g, ' ');
  for (let index = 1; index < ordered.length; index++) {
    const before = ordered[index - 1], after = ordered[index];
    if (after.pieces < before.pieces) {
      const missing = before.pieces - after.pieces;
      flags.push(makeFlag('short_landed', 'block', `short_landed:${jobId}:${after.handoff}`, { pieces: after.pieces, expected: before.pieces, handoff: label(after.handoff), missing }));
    } else if (after.pieces > before.pieces) flags.push(makeFlag('piece_increase', 'warn', `piece_increase:${jobId}:${after.handoff}`, { before: before.pieces, after: after.pieces, from: label(before.handoff), to: label(after.handoff) }));
    if (before.weightKg !== null && after.weightKg !== null && after.pieces === before.pieces) {
      const diff = Math.abs(before.weightKg - after.weightKg);
      if (diff > Math.max(tolerance.weightKg, Math.max(before.weightKg, after.weightKg) * tolerance.weightPct / 100)) flags.push(makeFlag('chain_weight_difference', 'warn', `chain_weight:${jobId}:${after.handoff}`, { before: before.weightKg, after: after.weightKg, from: label(before.handoff), to: label(after.handoff) }));
    }
  }
  return flags;
}
export async function recordPieceCount(ctx: Ctx, jobFileId: string, input: { handoff: Handoff; pieces: number; weightKg?: number | null; source: string; photoDocumentId?: string | null; documentId?: string | null }) {
  if (!HANDOFFS.includes(input.handoff) || !Number.isInteger(input.pieces) || input.pieces < 0 || input.pieces > 100000) throw new JobFileInputError('Give a handoff and a whole number of pieces.');
  const org = ctx.actor.organizationId;
  await ctx.repo.insert('ophanim_job_piece_counts', org, { jobFileId, handoff: input.handoff, pieces: input.pieces, weightKg: input.weightKg ?? null, source: input.source, photoDocumentId: input.photoDocumentId ?? null, documentId: input.documentId ?? null, recordedByUserId: userOf(ctx), recordedAt: new Date(ctx.now?.() ?? Date.now()).toISOString() });
  const counts = await ctx.repo.select<PieceCount>('ophanim_job_piece_counts', org, { jobFileId }, { order: 'recordedAt' });
  const latest = new Map<Handoff, PieceCount>(); for (const count of counts) latest.set(count.handoff, count);
  const flags = pieceChain([...latest.values()], jobFileId);
  const raised = await saveFlags(ctx, jobFileId, flags, { replaceCodes: ['short_landed', 'piece_increase', 'chain_weight_difference'] });
  for (const flag of raised) await upsertTodayItem(ctx, { kind: 'flag', jobFileId, sourceKey: `flag:${flag.id}`, titleEn: flag.messageEn, titleAr: flag.messageAr, probability: 0.9, cost: 3000, payload: { flagId: flag.id } });
  await audit(ctx, 'pieces.recorded', 'job_file', jobFileId, { handoff: input.handoff, pieces: input.pieces, weightKg: input.weightKg ?? null });
  return { flags: flags.map(flag => flag.code) };
}

// ---- Ghost Position ---------------------------------------------------------------
/** Inverse CDF of a step duration from p10/p50/p90 (piecewise linear, tails stretched). */
function durationAt(q: number, p10: number, p50: number, p90: number) {
  const p0 = Math.max(0, p10 - (p50 - p10) * 0.5), p100 = p90 + (p90 - p50) * 1.5;
  if (q <= 0.1) return p0 + (p10 - p0) * q / 0.1;
  if (q <= 0.5) return p10 + (p50 - p10) * (q - 0.1) / 0.4;
  if (q <= 0.9) return p50 + (p90 - p50) * (q - 0.5) / 0.4;
  return p90 + (p100 - p90) * (q - 0.9) / 0.1;
}
export const DEFAULT_REPORT_LAGS_HOURS = [0.5, 1, 2, 3, 4, 6, 8, 12];
/**
 * P(event already happened | not yet reported). Event time = start + duration;
 * report time = event + lag (the source's own history). Grid over duration quantiles × lag samples.
 */
export function ghostProbability(input: { startAt: number; now: number; p10: number; p50: number; p90: number; lagsHours?: number[] }) {
  const lags = input.lagsHours?.length ? input.lagsHours : DEFAULT_REPORT_LAGS_HOURS, elapsed = (input.now - input.startAt) / 36e5;
  let unreported = 0, happened = 0;
  for (let q = 0.005; q < 1; q += 0.01) {
    const duration = durationAt(q, input.p10, input.p50, input.p90);
    for (const lag of lags) { if (duration + lag <= elapsed) continue; unreported++; if (duration <= elapsed) happened++; }
  }
  return unreported ? Math.round(happened / unreported * 1000) / 1000 : 1;
}

// ---- Time gaps: expected but missing ------------------------------------------------
export type GapResult = { code: string; labelEn: string; overdueHours: number; ghost: number; dueAt: string; reporter: TemplateStep['reporter']; chaser: { subject: string; body: string; to: string | null; channel: 'email' | 'whatsapp' } };
type Duration = { fromCode: string; toCode: string; p10Hours: number; p50Hours: number; p90Hours: number; graceHours: number };
/** For each job: the next unreported step after the last confirmed one. Past p90 + grace → Today item, ghost badge and drafted chaser. */
export async function scanTimeGaps(ctx: Ctx, aggregate: JobAggregate): Promise<{ ghost: { code: string; probability: number } | null; gaps: GapResult[] }> {
  const { job } = aggregate, org = ctx.actor.organizationId, now = ctx.now?.() ?? Date.now();
  const template = await steps(ctx, job.mode), byCode = new Map(aggregate.milestones.map(item => [item.code, item]));
  const durations = await ctx.repo.select<Duration>('ophanim_step_durations', org, { mode: job.mode });
  const lagsRows = await ctx.repo.select<{ sourceKey: string; milestoneCode: string; lagSamplesHours: number[]; reportsMilestone: boolean }>('ophanim_source_report_lags', org);
  const results: GapResult[] = [], empty = { ghost: null as null | { code: string; probability: number }, gaps: results };
  let lastIndex = -1;
  template.forEach((item, index) => { const milestone = byCode.get(item.code); if (milestone?.actualAt && !milestone.needsConfirmation) lastIndex = index; });
  if (lastIndex < 0 || lastIndex >= template.length - 1) return empty;
  const previous = template[lastIndex], next = template[lastIndex + 1], startAt = Date.parse(byCode.get(previous.code)!.actualAt!);
  const learned = durations.find(item => item.fromCode === previous.code && item.toCode === next.code);
  const range = learned ? { p10: learned.p10Hours, p50: learned.p50Hours, p90: learned.p90Hours, grace: learned.graceHours } : { p10: next.p10, p50: next.p50, p90: next.p90, grace: next.grace ?? 1 };
  const sourceKey = `${next.reporter}:${job.destination ?? 'any'}`;
  const lagRow = lagsRows.find(item => item.sourceKey === sourceKey && item.milestoneCode === next.code);
  // Only alert where a source normally reports this milestone.
  if (lagRow && !lagRow.reportsMilestone) return empty;
  const dueAt = startAt + (range.p90 + range.grace) * 36e5;
  const ghost = ghostProbability({ startAt, now, ...range, lagsHours: lagRow?.lagSamplesHours });
  // Ghost Position is logged while the milestone is unreported, from the end of its usual window.
  if (now >= startAt + range.p50 * 36e5) await recordPrediction(ctx, {
    questionType: 'ghost_position', outcomeKind: 'binary', subjectKey: `ghost:${job.id}:${next.code}`, jobFileId: job.id, resolveBy: new Date(dueAt + 72 * 36e5).toISOString(),
    textEn: `${job.jobNumber}: "${next.labelEn}" has already happened although not reported`, textAr: `${job.jobNumber}: حدث "${next.labelAr}" بالفعل رغم عدم الإبلاغ`,
    probability: ghost, modelVersion: 'ghost-position@1', inputs: { startAt: new Date(startAt).toISOString(), hoursElapsed: Math.round((now - startAt) / 36e3) / 100, range, lags: lagRow?.lagSamplesHours ?? 'default', sourceKey },
    drivers: [{ label: 'hours since previous step', value: Math.round((now - startAt) / 36e3) / 100 }, { label: 'usual report lag (h)', value: lagRow ? 'learned' : 'default' }], trigger: 'time_gap_scan',
  });
  const ghostView = now >= startAt + range.p50 * 36e5 ? { code: next.code, probability: ghost } : null;
  if (now < dueAt) return { ghost: ghostView, gaps: results };
  const [counterparty] = await ctx.repo.select<{ name: string; email: string | null; whatsapp: string | null }>('ophanim_counterparties', org, { type: next.reporter === 'airline' ? 'airline' : next.reporter === 'terminal' ? 'terminal' : next.reporter === 'customs' ? 'broker' : next.reporter === 'trucker' ? 'trucker' : 'agent' });
  const refs = aggregate.references.filter(item => item.validated).map(item => `${item.type.toUpperCase()} ${item.normalizedValue}`).slice(0, 3).join(', ') || job.jobNumber;
  const expected = new Date(startAt + range.p90 * 36e5).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const chaser = { subject: t('en', 'chaser.subject', { job: job.jobNumber, milestone: next.labelEn }), body: t('en', 'chaser.body', { name: counterparty?.name ?? 'team', refs, milestone: next.labelEn, expected }), to: counterparty?.email ?? null, channel: counterparty?.email ? 'email' as const : 'whatsapp' as const };
  const overdueHours = Math.round((now - dueAt) / 36e3) / 100;
  await recordPrediction(ctx, { questionType: 'time_gap_risk', outcomeKind: 'binary', subjectKey: `gap:${job.id}:${next.code}`, jobFileId: job.id, resolveBy: new Date(dueAt + 72 * 36e5).toISOString(),
    textEn: `${job.jobNumber}: "${next.labelEn}" will be confirmed within 72 hours of its usual window`, probability: Math.max(0.05, Math.min(0.95, ghost)), modelVersion: 'time-gap@1', inputs: { range, overdueHours, ghost }, trigger: 'time_gap_scan' });
  await upsertTodayItem(ctx, { kind: 'missing_milestone', jobFileId: job.id, sourceKey: `missing:${job.id}:${next.code}`, dueAt: new Date(dueAt).toISOString(),
    titleEn: `${job.jobNumber}: ${next.labelEn} expected but missing (${overdueHours.toFixed(1)} h late)`, titleAr: `${job.jobNumber}: ${next.labelAr} متوقع لكنه غير مسجل`, probability: ghost, cost: 1500, payload: { code: next.code, chaser } });
  results.push({ code: next.code, labelEn: next.labelEn, overdueHours, ghost, dueAt: new Date(dueAt).toISOString(), reporter: next.reporter, chaser });
  return { ghost: ghostView, gaps: results };
}

/** Refine step durations from this organization's own completed jobs (needs ≥5 samples). */
export async function learnStepDurations(ctx: Ctx, mode: JobMode) {
  const org = ctx.actor.organizationId, jobs = await ctx.repo.select<JobFile>('ophanim_job_files', org, { mode });
  const milestones = await ctx.repo.select<JobMilestone>('ophanim_job_milestones', org, { jobFileId: jobs.map(job => job.id) });
  const template = templateFor(mode), learned: Array<{ from: string; to: string; samples: number }> = [];
  for (let index = 1; index < template.length; index++) {
    const from = template[index - 1].code, to = template[index].code;
    const samples = jobs.flatMap(job => { const a = milestones.find(item => item.jobFileId === job.id && item.code === from)?.actualAt, b = milestones.find(item => item.jobFileId === job.id && item.code === to)?.actualAt; return a && b && Date.parse(b) >= Date.parse(a) ? [(Date.parse(b) - Date.parse(a)) / 36e5] : []; }).sort((a, b) => a - b);
    if (samples.length < 5) continue;
    const quantile = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
    const values = { p10Hours: quantile(0.1), p50Hours: quantile(0.5), p90Hours: quantile(0.9), sampleCount: samples.length, source: 'history' };
    const [row] = await ctx.repo.select<{ id: string }>('ophanim_step_durations', org, { mode, fromCode: from, toCode: to });
    if (row) await ctx.repo.update('ophanim_step_durations', org, { id: row.id }, values); else await ctx.repo.insert('ophanim_step_durations', org, { mode, fromCode: from, toCode: to, graceHours: 1, ...values });
    learned.push({ from, to, samples: samples.length });
  }
  return learned;
}

// ---- Milestones from email -----------------------------------------------------------
const EMAIL_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: 'arrived', pattern: /\b(?:ATA|arrived|landed)\b[^.\n]{0,40}?(\d{1,2}[ /-][A-Za-z0-9]{2,3}[ /-]\d{2,4}[ T]+\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})/i },
  { code: 'terminal_received', pattern: /\b(?:received at (?:the )?terminal|RCF|cargo received)\b[^.\n]{0,40}?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}|\d{1,2}[ /-][A-Za-z0-9]{2,3}[ /-]\d{2,4}[ T]+\d{1,2}:\d{2})/i },
  { code: 'customs_cleared', pattern: /\b(?:customs cleared|cleared customs|clearance completed)\b[^.\n]{0,40}?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}|\d{1,2}[ /-][A-Za-z0-9]{2,3}[ /-]\d{2,4}[ T]+\d{1,2}:\d{2})/i },
  { code: 'do_issued', pattern: /\b(?:delivery order|D\/O) (?:issued|released)\b[^.\n]{0,40}?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}|\d{1,2}[ /-][A-Za-z0-9]{2,3}[ /-]\d{2,4}[ T]+\d{1,2}:\d{2})/i },
  { code: 'departed', pattern: /\b(?:ATD|departed|took off|sailed)\b[^.\n]{0,40}?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}|\d{1,2}[ /-][A-Za-z0-9]{2,3}[ /-]\d{2,4}[ T]+\d{1,2}:\d{2})/i },
  { code: 'delivered', pattern: /\b(?:delivered|POD)\b[^.\n]{0,40}?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}|\d{1,2}[ /-][A-Za-z0-9]{2,3}[ /-]\d{2,4}[ T]+\d{1,2}:\d{2})/i },
];
const EXPECTED = /\b(?:ETA|expected|estimated)\b/i;
/** Deterministic extraction of planned/expected/actual milestone times from email text. Times without a zone are read as Gulf time (+04:00). */
export function milestonesFromText(text: string) {
  return EMAIL_PATTERNS.flatMap(({ code, pattern }) => {
    const match = text.match(pattern); if (!match) return [];
    const raw = match[1].replace(/\s+/g, ' ').trim(), iso = /^\d{4}-/.test(raw) ? `${raw.replace(' ', 'T')}:00+04:00` : raw;
    const at = Date.parse(iso) || Date.parse(`${raw} GMT+0400`);
    if (!Number.isFinite(at)) return [];
    const expected = EXPECTED.test(match[0]);
    return [{ code, at: new Date(at).toISOString(), kind: expected ? 'expected' as const : 'actual' as const, confidence: /^\d{4}-/.test(raw) ? 0.85 : 0.7, evidence: match[0].slice(0, 200) }];
  });
}
const AI_CODES: Array<[RegExp, string]> = [[/terminal|received|rcf|unload/i, 'terminal_received'], [/custom|clear/i, 'customs_cleared'], [/delivery order|d\/o/i, 'do_issued'], [/deliver|pod/i, 'delivered'], [/collect|pick/i, 'collected'],
  [/discharg/i, 'discharged'], [/gate/i, 'gated_in'], [/load/i, 'loaded'], [/depart|atd|sail|took off/i, 'departed'], [/arriv|ata|land/i, 'arrived']];
/** Optional AI reading of an email (central config, task understand_email). Always lower confidence → one-tap confirmation. */
export async function aiMilestones(text: string) {
  const { getServerAiConfig } = await import('@/lib/ai/config');
  const config = getServerAiConfig();
  if (!config?.enabledTasks.includes('understand_email')) return [];
  const { generateWithRouting } = await import('@/lib/ai/local-model');
  try {
    const parsed = JSON.parse(String(await generateWithRouting(config, { task: 'understand_email', input: text.slice(0, 8000), mode: 'logistics' }))) as { milestones?: Array<{ type?: string; date?: string | null }> };
    return (parsed.milestones ?? []).flatMap(item => {
      const code = AI_CODES.find(([pattern]) => pattern.test(item.type ?? ''))?.[1], at = item.date ? Date.parse(item.date) : NaN;
      return code && Number.isFinite(at) ? [{ code, at: new Date(at).toISOString(), kind: /expect|eta|estimat/i.test(item.type ?? '') ? 'expected' as const : 'actual' as const, confidence: 0.7, evidence: `AI: ${item.type}` }] : [];
    });
  } catch { return []; }
}
export async function applyEmailMilestones(ctx: Ctx, jobFileId: string, text: string, sourceKey: string | null) {
  const rules = milestonesFromText(text), ai = await aiMilestones(text);
  const found = [...rules, ...ai.filter(item => !rules.some(rule => rule.code === item.code))];
  for (const item of found) await recordMilestone(ctx, jobFileId, { code: item.code, ...(item.kind === 'actual' ? { actualAt: item.at } : { expectedAt: item.at }), source: 'email', sourceKey, confidence: item.confidence, evidenceText: item.evidence });
  return found;
}
