import type { NormalizedSearchResult } from '@/lib/providers';

export function snapshotResults(results: NormalizedSearchResult[]): string {
  return JSON.stringify(results.map(({ id, label, provider, summary, lat, lng }) => ({ id, label, provider, summary, lat, lng }))
    .sort((a, b) => a.id.localeCompare(b.id)));
}

export function didWatchlistChange(previous: string | undefined, next: string): boolean {
  return Boolean(previous) && previous !== next;
}
