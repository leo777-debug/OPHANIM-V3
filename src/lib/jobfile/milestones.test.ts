import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { ghostProbability, milestonesFromText, pieceChain, recordMilestone, recordPieceCount } from './milestones';
import { memoryRepo } from './repo';
import { createJobFile, loadJob } from './service';
import type { TodayItem } from './today';
import { jobView } from './view';
import type { Ctx } from './types';

const ORG = '00000000-0000-4000-8000-0000000000e1', H = 36e5;

describe('milestones, gaps and ghosts', () => {
  it('ghost probability rises as the usual window passes', () => {
    const base = { startAt: 0, p10: 1.5, p50: 3, p90: 5 };
    const early = ghostProbability({ ...base, now: 1 * H }), late = ghostProbability({ ...base, now: 6.5 * H });
    expect(early).toBeLessThan(late); expect(late).toBeGreaterThan(0.6); expect(late).toBeLessThan(1);
    expect(ghostProbability({ ...base, now: 6.5 * H, lagsHours: [0.25] })).toBeLessThan(late); // prompt reporters → less likely already happened
  });

  it('landed with no terminal receipt after the usual window: Today item, ghost probability and drafted chaser', async () => {
    let now = Date.parse('2026-10-24T02:00:00Z');
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u', role: 'owner', demo: true }, now: () => now };
    const job = await createJobFile(ctx, { mode: 'air_import', jobNumber: 'JF-9001', destination: 'DXB', references: [{ type: 'awb', value: '176-12345675' }] });
    await ctx.repo.insert('ophanim_counterparties', ORG, { name: 'SYNTHETIC Terminal Desk', normalizedName: 'SYNTHETIC TERMINAL DESK', type: 'terminal', email: 'terminal@example.test', identifiers: {} });
    await recordMilestone(ctx, job.id, { code: 'arrived', actualAt: new Date(now).toISOString(), source: 'api', sourceKey: 'airline:DXB' });
    now += 7 * H;
    const view = (await jobView(ctx, job.id))!;
    expect(view.ghosts[0].milestoneCode).toBe('terminal_received');
    expect(view.ghosts[0].probability).toBeGreaterThan(0.6);
    expect(view.chasers[0]).toMatchObject({ milestoneCode: 'terminal_received', to: 'terminal@example.test', channel: 'email' });
    expect(view.chasers[0].body).toContain('176-12345675');
    const today = await ctx.repo.select<TodayItem>('ophanim_today_items', ORG, { kind: 'missing_milestone' });
    expect(today).toHaveLength(1); expect(today[0].titleEn).toContain('expected but missing');
    expect(view.predictions.map(item => item.questionType)).toEqual(expect.arrayContaining(['ghost_position', 'time_gap_risk']));
    // Confirmation arrives: the ghost is resolved and scored, the Today item closes.
    now += 1 * H;
    await recordMilestone(ctx, job.id, { code: 'terminal_received', actualAt: new Date(now - 4 * H).toISOString(), source: 'email', sourceKey: 'terminal:DXB', confidence: 0.9 });
    const after = (await jobView(ctx, job.id))!;
    expect(after.predictions.find(item => item.questionType === 'ghost_position')?.status).toBe('called');
    expect((await ctx.repo.select<TodayItem>('ophanim_today_items', ORG, { kind: 'missing_milestone' }))[0].state).toBe('done');
    const lags = await ctx.repo.select<{ lagSamplesHours: number[] }>('ophanim_source_report_lags', ORG, { sourceKey: 'terminal:DXB' });
    expect(lags[0].lagSamplesHours).toEqual([4]);
  });

  it('flags a short-landed manifest (11 of 12) and weight changes along the chain', async () => {
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u', role: 'owner', demo: true } };
    const job = await createJobFile(ctx, { mode: 'air_import', jobNumber: 'JF-9002' });
    await recordPieceCount(ctx, job.id, { handoff: 'booked', pieces: 12, weightKg: 1240, source: 'document' });
    expect((await recordPieceCount(ctx, job.id, { handoff: 'manifested', pieces: 11, weightKg: 1135, source: 'document' })).flags).toEqual(['short_landed']);
    const flag = (await loadJob(ctx, job.id))!.flags.find(item => item.checkCode === 'short_landed')!;
    expect(flag.messageEn).toBe('Short-landed: 11 of 12 pieces at manifested. 1 likely on the next flight.');
    expect(flag.severity).toBe('block');
    expect(pieceChain([{ id: 'a', handoff: 'landed', pieces: 12, weightKg: 1240 }, { id: 'b', handoff: 'terminal_received', pieces: 13, weightKg: 1240 }], 'j').map(item => item.code)).toEqual(['piece_increase']);
    expect(pieceChain([{ id: 'a', handoff: 'landed', pieces: 12, weightKg: 1240 }, { id: 'b', handoff: 'warehouse_tally', pieces: 12, weightKg: 1200 }], 'j').map(item => item.code)).toEqual(['chain_weight_difference']);
  });

  it('extracts milestone times from email text; low confidence waits for confirmation', async () => {
    const found = milestonesFromText('Dear team, flight EK9881 landed 2026-10-24 06:10. Cargo received at terminal 24-Oct-2026 11:05. ETA delivery 2026-10-25 09:00');
    expect(found.map(item => [item.code, item.kind, item.at])).toEqual([['arrived', 'actual', '2026-10-24T02:10:00.000Z'], ['terminal_received', 'actual', '2026-10-24T07:05:00.000Z']]);
    const ctx: Ctx = { repo: memoryRepo(), actor: { organizationId: ORG, userId: 'u', role: 'owner', demo: true } };
    const job = await createJobFile(ctx, { mode: 'air_import', jobNumber: 'JF-9003' });
    expect((await recordMilestone(ctx, job.id, { code: 'arrived', actualAt: found[0].at, source: 'email', confidence: 0.7 })).needsConfirmation).toBe(true);
  });
});
