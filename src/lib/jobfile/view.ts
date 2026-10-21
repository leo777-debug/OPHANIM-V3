// What the job file page shows: the aggregate, signed links for its private files,
// milestone ghosts and chasers, papers and the Receipts strip. Viewing a prediction
// records that it was shown.
import { jobConditions } from './congestion';
import { margin } from './invoices';
import { jobPredictions, markShown } from './ledger';
import { ensureMilestones, milestoneLabels, scanTimeGaps } from './milestones';
import { listPapers } from './papers';
import { loadJob } from './service';
import { signedUrl } from './storage';
import type { Ctx } from './types';

export async function jobView(ctx: Ctx, id: string) {
  const first = await loadJob(ctx, id);
  if (!first) return null;
  await ensureMilestones(ctx, first.job);
  const gaps = await scanTimeGaps(ctx, (await loadJob(ctx, id))!);
  const events = await jobConditions(ctx, (await loadJob(ctx, id))!);
  const aggregate = (await loadJob(ctx, id))!;
  const documents = await Promise.all(aggregate.documents.map(async document => ({ ...document, url: await signedUrl(document.storagePath, ctx.actor.demo).catch(() => null) })));
  const predictions = await jobPredictions(ctx, id);
  await markShown(ctx, predictions.filter(item => item.status === 'pending').map(item => item.id));
  return {
    ...aggregate, documents, papers: await listPapers(ctx, id), predictions, milestoneLabels: milestoneLabels(aggregate.job.mode), events, margin: margin(aggregate.invoices),
    ghosts: gaps.ghost ? [{ milestoneCode: gaps.ghost.code, probability: gaps.ghost.probability, label: 'ESTIMATE' }] : [],
    chasers: gaps.gaps.map(gap => ({ milestoneCode: gap.code, ...gap.chaser })),
  };
}
