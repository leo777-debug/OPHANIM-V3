import { searchProviders, type NormalizedSearchResult } from '@/lib/providers';
import type { PortCandidate, PortResolution } from './types';

function text(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 2 || normalized.length > 160) throw new Error('Port search must be between 2 and 160 characters.');
  return normalized;
}

function countryCode(result: NormalizedSearchResult): string | undefined {
  const value = result.location?.country;
  return value && /^[A-Z]{2}$/i.test(value) ? value.toUpperCase() : undefined;
}

export function portCandidates(results: NormalizedSearchResult[]): PortCandidate[] {
  const seen = new Set<string>();
  return results.flatMap((result) => {
    if (result.lat === undefined || result.lng === undefined || !Number.isFinite(result.lat) || !Number.isFinite(result.lng)) return [];
    const key = `${result.provider}:${result.id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      id: result.id,
      providerId: result.provider,
      label: result.label,
      latitude: result.lat,
      longitude: result.lng,
      country: result.location?.country,
      countryCode: countryCode(result),
      summary: result.summary,
    }];
  });
}

export function createPortResolution(query: string, results: NormalizedSearchResult[], coverage: PortResolution['coverage']): PortResolution {
  return { query: text(query), candidates: portCandidates(results), selectionRequired: true, coverage };
}

export async function resolvePortCandidates(query: string): Promise<PortResolution> {
  const normalizedQuery = text(query);
  const response = await searchProviders({ query: `port ${normalizedQuery}`, limit: '10' });
  return createPortResolution(normalizedQuery, response.results, response.diagnostics.length > 0 ? 'available' : 'unavailable');
}
