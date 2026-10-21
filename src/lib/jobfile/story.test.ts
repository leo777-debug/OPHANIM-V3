import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { jobPredictions } from './ledger';
import { checkingOurWork } from './receipts';
import { memoryRepo, postgresRepo, type Repo } from './repo';
import { loadJob } from './service';
import { playStory } from './story';
import { jobFileDatabase, ORG_A } from './test-db';
import type { TodayItem } from './today';
import type { Ctx } from './types';

const H = 36e5;
async function story(repo: Repo) {
  const ctx: Omit<Ctx, 'now'> = { repo, actor: { organizationId: ORG_A, userId: '00000000-0000-4000-8000-0000000000a1', role: 'owner', demo: true } };
  const arrivalAt = Date.parse('2026-10-24T02:30:00Z'), clock = { now: arrivalAt - 26 * H };
  // Steps 1–4, checking the state at the ghost stage.
  const early = await playStory(ctx, clock, { jobNumber: 'JF-1001', arrivalAt, stopAfter: 4 });
  const job = (await loadJob({ ...ctx, now: () => clock.now }, early.jobId))!;
  const open = job.flags.filter(flag => flag.status === 'open');
  const weight = open.find(flag => flag.checkCode === 'weight_mismatch')!;
  expect(weight.messageEn).toContain('36 kg');
  expect(early.risk.oneIn).toBe(4);
  expect(open.find(flag => flag.checkCode === 'weather_fog')?.messageEn).toMatch(/^Fog risk at DXB on your arrival morning/);
  expect(open.find(flag => flag.checkCode === 'short_landed')?.messageEn).toBe('Short-landed: 11 of 12 pieces at manifested. 1 likely on the next flight.');
  expect(early.view!.ghosts[0]).toMatchObject({ milestoneCode: 'terminal_received' });
  expect(early.view!.ghosts[0].probability).toBeGreaterThan(0.75); expect(early.view!.ghosts[0].probability).toBeLessThan(0.85);
  expect(early.view!.chasers[0]).toMatchObject({ to: 'terminal-desk@example.test' });
  expect(early.view!.predictions.find(item => item.questionType === 'paper_risk')?.summary).toBe('25%');
  expect((await repo.select<TodayItem>('ophanim_today_items', ORG_A, { kind: 'missing_milestone' }))).toHaveLength(1);
  // Crop view: each value keeps its page and box on the photographed paper.
  const invoiceWeight = job.documents.find(document => document.docTypeCode === 'commercial_invoice')!.fields!.find(field => field.field === 'gross_weight_kg')!;
  expect(invoiceWeight.bbox).toEqual({ x: 0.52, y: 0.38, w: 0.4, h: 0.045 });
  return { ctx, clock, arrivalAt, jobId: early.jobId };
}

describe('end-to-end SYNTHETIC DEMO story', () => {
  it('plays from pre-alert to scored predictions (in-memory store)', async () => {
    const repo = memoryRepo(), { ctx, arrivalAt, jobId } = await story(repo);
    // Close the first run, then play the whole story to the end on a fresh job (closed jobs leave the key ring).
    await repo.update('ophanim_job_files', ORG_A, { id: jobId }, { status: 'closed' });
    const full = await playStory(ctx, { now: arrivalAt - 26 * H + 60 * 864e5 }, { jobNumber: 'JF-1002', arrivalAt: arrivalAt + 60 * 864e5 });
    expect(full.jobId).not.toBe(jobId);
    const job = (await loadJob({ ...ctx, now: () => arrivalAt + 100 * 864e5 }, full.jobId))!;
    expect(job.documents.map(document => document.docTypeCode)).toEqual(expect.arrayContaining(['delivery_order', 'gate_pass']));
    expect(job.milestones.find(item => item.code === 'delivered')?.actualAt).toBeTruthy();
    expect(job.invoices.find(item => item.direction === 'outgoing')).toMatchObject({ status: 'paid' });
    expect((await repo.select<{ event: string }>('ophanim_site_events', ORG_A, { jobFileId: full.jobId })).map(item => item.event)).toEqual(['arrived', 'loaded', 'left']);
    const receipts = await jobPredictions({ ...ctx, now: () => Date.now() }, full.jobId);
    const status = Object.fromEntries(receipts.map(item => [item.questionType, item.status]));
    expect(status).toMatchObject({ ghost_position: 'called', payment_date: 'called', paper_risk: 'called', weather_impact: 'called', dispute_odds: 'called' });
    const report = await checkingOurWork({ ...ctx });
    expect(report.map(item => item.questionType)).toEqual(expect.arrayContaining(['ghost_position', 'paper_risk', 'payment_date', 'weather_impact']));
  });

  it('plays steps 1–4 against PostgreSQL with the real migrations', async () => {
    const pg = await jobFileDatabase();
    try { await story(postgresRepo((sql, values) => pg.query(sql, values) as never)); } finally { await pg.close(); }
  });
});
