// What the job file page shows: the aggregate plus signed links for its private files.
import { listPapers } from './papers';
import { loadJob } from './service';
import { signedUrl } from './storage';
import type { Ctx } from './types';

export async function jobView(ctx: Ctx, id: string) {
  const aggregate = await loadJob(ctx, id);
  if (!aggregate) return null;
  const documents = await Promise.all(aggregate.documents.map(async document => ({ ...document, url: await signedUrl(document.storagePath, ctx.actor.demo).catch(() => null) })));
  return { ...aggregate, documents, papers: await listPapers(ctx, id) };
}
