import { normalizeResults } from './normalize-results';
import type { EnrichmentResponse, Provider, ProviderDiagnostic, ProviderQuery } from './types';

class ProviderTimeoutError extends Error {}

async function executeWithTimeout(provider: Provider, query: ProviderQuery): Promise<unknown> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ProviderTimeoutError());
    }, provider.metadata.timeoutMs);
  });

  try {
    return await Promise.race([
      provider.execute(query, { signal: controller.signal, locale: 'en' }),
      timeoutResult,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class EnrichmentManager {
  async enrich(query: ProviderQuery, providers: Provider[]): Promise<EnrichmentResponse> {
    const settled = await Promise.all(providers.map(async (provider) => {
      try {
        const raw = await executeWithTimeout(provider, query);
        const results = normalizeResults(provider, raw, query);
        const diagnostic: ProviderDiagnostic = {
          provider: provider.metadata.name,
          status: 'success',
          resultCount: results.length,
        };
        return { results, diagnostic };
      } catch (error) {
        const diagnostic: ProviderDiagnostic = {
          provider: provider.metadata.name,
          status: error instanceof ProviderTimeoutError ? 'timeout' : 'error',
          resultCount: 0,
        };
        return { results: [], diagnostic };
      }
    }));

    return {
      results: settled.flatMap(({ results }) => results),
      diagnostics: settled.map(({ diagnostic }) => diagnostic),
    };
  }
}
