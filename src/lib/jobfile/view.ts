// What the job file page shows: the aggregate, signed links for its private files,
// milestone ghosts and chasers, papers and the Receipts strip.
// `refresh` (same-origin callers who can write) also records predictions, flags,
// Today items and "shown" marks; read-only callers get the same view without writes.
import { jobConditions } from './congestion';
import { margin } from './invoices';
import { jobPredictions, markShown } from './ledger';
import { ensureMilestones, milestoneLabels, scanTimeGaps } from './milestones';
import { listPapers } from './papers';
import { loadJob } from './service';
import { signedUrl } from './storage';
import type { Ctx } from './types';

export async function jobView(ctx: Ctx, id: string, options: { refresh?: boolean } = {}) {
  const refresh = options.refresh !== false;
  let aggregate = await loadJob(ctx, id);
  if (!aggregate) return null;
  if (refresh && !aggregate.milestones.length) { await ensureMilestones(ctx, aggregate.job); aggregate = (await loadJob(ctx, id))!; }
  const gaps = await scanTimeGaps(ctx, aggregate, { persist: refresh });
  const events = await jobConditions(ctx, aggregate, { persist: refresh });
  // Flags and Today items may have changed; reload only when this request wrote.
  if (refresh) aggregate = (await loadJob(ctx, id))!;
  const documents = await Promise.all(aggregate.documents.map(async document => ({ ...document, url: await signedUrl(document.storagePath, ctx.actor.demo).catch(() => null) })));
  const predictions = await jobPredictions(ctx, id);
  if (refresh) await markShown(ctx, predictions.filter(item => item.status === 'pending').map(item => item.id));
  return {
    ...aggregate, documents, papers: await listPapers(ctx, id), predictions, milestoneLabels: milestoneLabels(aggregate.job.mode), events, margin: margin(aggregate.invoices),
    ghosts: gaps.ghost ? [{ milestoneCode: gaps.ghost.code, probability: gaps.ghost.probability, label: 'ESTIMATE' }] : [],
    chasers: gaps.gaps.map(gap => ({ milestoneCode: gap.code, ...gap.chaser })),
  };
}
