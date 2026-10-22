import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { brier, recordInteraction, recordPrediction, resolveQuestion, scoreForecast } from './ledger';
import { calibrate, checkingOurWork, paperRisk } from './receipts';
import { memoryRepo } from './repo';
import type { JobAggregate } from './service';
import type { Ctx } from './types';

const ORG = '00000000-0000-4000-8000-0000000000d9';

describe('prediction ledger and Receipts', () => {
  it('scores, calibrates and excludes interventions per prediction type', async () => {
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u', role: 'owner', demo: true } };
    const { id: shipmentId } = await ctx.repo.insert<{ id: string }>('ophanim_shipments', ORG, { shipmentReference: 'SYNTHETIC-S1' });
    const cases: Array<[number, boolean]> = [[0.9, true], [0.8, true], [0.85, false], [0.2, false], [0.1, false], [0.15, true], [0.6, true], [0.55, false]];
    for (const [index, [probability, outcome]] of cases.entries()) {
      await recordPrediction(ctx, { questionType: 'paper_risk', outcomeKind: 'binary', shipmentId, subjectKey: `paper:${index}`, textEn: `Synthetic paper risk ${index}`, probability, modelVersion: 'paper-risk@1', inputs: { index } });
      await resolveQuestion(ctx, `paper:${index}`, { bool: outcome, source: 'manual' });
    }
    // A heeded warning whose problem did not happen is excluded from calibration.
    const { forecast } = await recordPrediction(ctx, { questionType: 'paper_risk', outcomeKind: 'binary', shipmentId, subjectKey: 'paper:acted', textEn: 'Synthetic acted-on warning', probability: 0.9, modelVersion: 'paper-risk@1', inputs: { acted: true } });
    await recordInteraction(ctx, forecast.id, 'acted', 'fixed paperwork');
    await resolveQuestion(ctx, 'paper:acted', { bool: false, source: 'manual' });
    // Interval prediction: coverage.
    await recordPrediction(ctx, { questionType: 'payment_date', outcomeKind: 'interval', shipmentId, subjectKey: 'pay:1', textEn: 'Synthetic payment range', p10At: '2026-11-01T00:00:00Z', p50At: '2026-11-10T00:00:00Z', p90At: '2026-11-30T00:00:00Z', modelVersion: 'payment-date@1', inputs: { a: 1 } });
    await resolveQuestion(ctx, 'pay:1', { at: '2026-11-12T00:00:00Z', source: 'invoice_paid' });
    const report = await checkingOurWork(ctx);
    const paper = report.find(item => item.questionType === 'paper_risk')!;
    expect(paper).toMatchObject({ resolved: 8, excluded: 1 });
    const expected = cases.reduce((sum, [p, o]) => sum + brier(p, o), 0) / cases.length;
    expect(paper.brier).toBeCloseTo(expected, 3); expect(paper.baseRate).toBe(0.5); expect(paper.baselineBrier).toBe(0.25);
    expect(paper.bins.reduce((sum, bin) => sum + bin.n, 0)).toBe(8);
    expect(report.find(item => item.questionType === 'payment_date')).toMatchObject({ coverage: 1, intervals: 1 });
  });

  it('never rewrites a prediction: unchanged inputs add no row, changed inputs add one', async () => {
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u', role: 'owner', demo: true }, now: () => Date.parse('2026-10-14T09:00:00Z') };
    const { id: shipmentId } = await ctx.repo.insert<{ id: string }>('ophanim_shipments', ORG, { shipmentReference: 'SYNTHETIC-S2' });
    const base = { questionType: 'paper_risk' as const, outcomeKind: 'binary' as const, subjectKey: 'paper:j', shipmentId, textEn: 'Synthetic paper risk', modelVersion: 'paper-risk@1' };
    expect((await recordPrediction(ctx, { ...base, probability: 0.5, inputs: { flags: 1 } })).created).toBe(true);
    expect((await recordPrediction(ctx, { ...base, probability: 0.5, inputs: { flags: 1 } })).created).toBe(false);
    expect((await recordPrediction(ctx, { ...base, probability: 0.8, inputs: { flags: 2 } })).created).toBe(true);
    expect(await ctx.repo.select('ophanim_forecasts', ORG)).toHaveLength(2);
    expect(scoreForecast({ probability: 0.8, p10At: null, p50At: null, p90At: null }, { outcome: true, actualAt: null }).brier).toBeCloseTo(0.04);
  });

  it('judges each Ghost Position estimate against its own time', async () => {
    let now = Date.parse('2026-10-14T05:00:00Z');
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u', role: 'owner', demo: true }, now: () => now };
    const { id: shipmentId } = await ctx.repo.insert<{ id: string }>('ophanim_shipments', ORG, { shipmentReference: 'SYNTHETIC-S3' });
    const base = { questionType: 'ghost_position' as const, outcomeKind: 'binary' as const, subjectKey: 'ghost:j:terminal_received', shipmentId, textEn: 'Synthetic ghost', modelVersion: 'ghost-position@1' };
    await recordPrediction(ctx, { ...base, probability: 0.3, inputs: { h: 2 } });
    now += 3 * 36e5; await recordPrediction(ctx, { ...base, probability: 0.85, inputs: { h: 5 } });
    expect(await ctx.repo.select('ophanim_forecast_questions', ORG)).toHaveLength(2);
    // The event really happened at 06:30: after the first estimate, before the second.
    await resolveQuestion(ctx, 'ghost:j:terminal_received', { at: '2026-10-14T06:30:00Z', bool: true, source: 'milestone' });
    const outcomes = await ctx.repo.select<{ outcome: boolean }>('ophanim_forecast_outcomes', ORG);
    expect(outcomes.map(item => item.outcome).sort()).toEqual([false, true]);
    const scores = await ctx.repo.select<{ brier: number }>('ophanim_forecast_scores', ORG);
    expect(scores.map(item => item.brier).sort()).toEqual([0.0225, 0.09]);
  });

  it('Paper Risk gives about 1 in 4 for a weight mismatch, with the reason', () => {
    const aggregate = { flags: [{ status: 'open', checkCode: 'weight_mismatch' }], documents: [] } as unknown as JobAggregate;
    const risk = paperRisk(aggregate);
    expect(risk.oneIn).toBe(4); expect(risk.probability).toBeCloseTo(0.25, 1); expect(risk.reasons[0].label).toBe('weight differs between documents');
    expect(calibrate([], 'x')).toMatchObject({ resolved: 0, brier: null });
  });
});
