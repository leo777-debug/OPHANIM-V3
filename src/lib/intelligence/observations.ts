import { createHash } from 'node:crypto';
import { canonicalStoryUrl } from './analysis';
import { recordRuntimeFirstSeen, type RuntimeStorage } from '@/lib/runtime/store';

/** Stable public article identity; neither query tracking tags nor publication time reset it. */
export function articleObservationId(source: string, link: string, title: string) {
  return createHash('sha256').update(`${source}:${canonicalStoryUrl(link) || title}`).digest('hex').slice(0, 24);
}
export async function observeArticles(ids: string[], time = new Date().toISOString()) {
  const groups = new Map<string, string[]>();
  for (const id of new Set(ids)) {
    if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('Invalid public article identity.');
    const bucket = id.slice(0, 1); groups.set(bucket, [...(groups.get(bucket) ?? []), id]);
  }
  const items: Record<string, string> = {}, modes = new Set<RuntimeStorage>(), warnings = new Set<string>();
  // Sequential bounded bucket writes avoid exhausting a shared connection pool.
  for (const [bucket, values] of groups) {
    const result = await recordRuntimeFirstSeen(`news-seen-${bucket}`, values, time);
    Object.assign(items, result.items); modes.add(result.storage); if (result.warning) warnings.add(result.warning);
  }
  return { items, storage: modes.has('memory') ? 'memory' : modes.has('local-file') ? 'local-file' : modes.has('postgres') ? 'postgres' : 'no-observations', warning: [...warnings].join(' ') || null };
}
