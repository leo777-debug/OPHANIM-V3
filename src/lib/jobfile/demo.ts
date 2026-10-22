// SYNTHETIC DEMO data for demo mode (no database). Every name, number and party is invented.
import { recordPrediction, resolveQuestion } from './ledger';
import { playStory } from './story';
import type { Ctx } from './types';

export const DEMO_LABEL = 'SYNTHETIC DEMO';
const H = 36e5;

/** Deterministic pseudo-random numbers so the synthetic history is the same on every start. */
function random(seed: number) { let state = seed; return () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; }; }

export async function seedDemo(ctx: Ctx) {
  const now = Date.now(), org = ctx.actor.organizationId;
  // A finished job on the same lane: every step, invoice paid, predictions scored.
  const past = { now: now - 41 * 864e5 };
  const done = await playStory(ctx, past, { jobNumber: 'JF-1000', arrivalAt: now - 40 * 864e5 });
  await ctx.repo.update('ophanim_job_files', org, { id: done.jobId }, { status: 'closed' });
  // Synthetic resolved history so "Checking our work" has something to show.
  const next = random(20261021);
  const { id: historyShipment } = await ctx.repo.insert<{ id: string }>('ophanim_shipments', org, { shipmentReference: `${DEMO_LABEL} history`, metadata: { synthetic: true } });
  for (let index = 0; index < 60; index++) {
    const type = index % 2 ? 'paper_risk' : 'ghost_position', probability = Math.round(next() * 100) / 100, happened = next() < probability * 0.9 + 0.05;
    await recordPrediction({ ...ctx, now: () => now - (90 - index) * 864e5 }, { questionType: type, outcomeKind: 'binary', subjectKey: `synthetic-history:${index}`, shipmentId: historyShipment, textEn: `${DEMO_LABEL} history ${type.replace('_', ' ')} #${index + 1}`, probability, modelVersion: type === 'paper_risk' ? 'paper-risk@1' : 'ghost-position@1', inputs: { synthetic: true, index } });
    await resolveQuestion({ ...ctx, now: () => now - (89 - index) * 864e5 }, `synthetic-history:${index}`, { bool: happened, source: type === 'paper_risk' ? 'query_received' : 'milestone', evidence: { synthetic: true } });
  }
  await ctx.repo.insert('ophanim_city_pulse_events', org, { emirate: 'Dubai', kind: 'truck_curfew', titleEn: `${DEMO_LABEL} example truck restriction (not a real rule)`, titleAr: `${DEMO_LABEL} مثال على حظر الشاحنات (ليست قاعدة حقيقية)`, weekly: { days: [0, 1, 2, 3, 4], from: '06:30', to: '09:00' }, appliesTo: 'truck', isSynthetic: true });
  // The live job: landed 6.5 hours ago, terminal receipt not yet reported.
  await playStory(ctx, { now: now - 26 * H }, { jobNumber: 'JF-1001', arrivalAt: now - 6.5 * H, stopAfter: 4 });
}
