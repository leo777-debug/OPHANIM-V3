import type { NormalizedSearchResult, Provider, ProviderQuery } from './types';

export function normalizeResults(provider: Provider, raw: unknown, query: ProviderQuery): NormalizedSearchResult[] {
  const seen = new Set<string>();

  return provider.normalize(raw, query).filter((result) => {
    if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng)) return false;
    if (result.lat < -90 || result.lat > 90 || result.lng < -180 || result.lng > 180) return false;

    const key = `${result.provider}:${result.lat.toFixed(6)}:${result.lng.toFixed(6)}:${result.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
