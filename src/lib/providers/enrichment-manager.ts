import { normalizeResults } from './normalize-results';
import { providerHealth } from './provider-health';
import { providerId, type EnrichmentResponse, type Provider, type ProviderDiagnostic, type ProviderExecutionContext, type ProviderQuery } from './types';
import { providerMetrics } from './provider-metrics';

class ProviderTimeoutError extends Error {}

function retryable(error: unknown): boolean {
  if (error instanceof ProviderTimeoutError) return true;
  const message = error instanceof Error ? error.message : '';
  return /\b(408|425|429|500|502|503|504)\b|network|temporar|rate.?limit/i.test(message);
}

async function executeProvider(provider: Provider, query: ProviderQuery, context: ProviderExecutionContext): Promise<unknown> {
  if (provider.search) return provider.search(query, context);
  if (provider.fetch) return provider.fetch(query, context);
  if (provider.execute) return provider.execute(query, context);
  throw new Error('Provider does not support search execution');
}

async function executeWithTimeout(provider: Provider, query: ProviderQuery, context: Omit<ProviderExecutionContext, 'signal'>): Promise<unknown> {
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
      executeProvider(provider, query, { ...context, signal: controller.signal }),
      timeoutResult,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class EnrichmentManager {
  async enrich(query: ProviderQuery, providers: Provider[], context: Omit<ProviderExecutionContext, 'signal'> = { locale: 'en' }): Promise<EnrichmentResponse> {
    const settled = await Promise.all(providers.map(async (provider) => {
      const id = providerId(provider.metadata);
      if (!providerHealth.canExecute(id)) {
        const diagnostic: ProviderDiagnostic = { provider: id, status: 'circuit_open', resultCount: 0 };
        return { results: [], diagnostic };
      }
      let error: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const startedAt = performance.now();
        providerMetrics.recordAttempt(id, attempt > 0);
        try {
          const raw = await executeWithTimeout(provider, query, context);
          const results = normalizeResults(provider, raw, query);
          providerHealth.recordSuccess(id);
          providerMetrics.recordSuccess(id, performance.now() - startedAt);
          const diagnostic: ProviderDiagnostic = { provider: id, status: 'success', resultCount: results.length };
          return { results, diagnostic };
        } catch (caught) {
          error = caught;
          providerMetrics.recordFailure(id, caught instanceof ProviderTimeoutError);
          if (attempt === 0 && retryable(caught)) continue;
        }
      }
      providerHealth.recordFailure(id);
      const diagnostic: ProviderDiagnostic = { provider: id, status: error instanceof ProviderTimeoutError ? 'timeout' : 'error', resultCount: 0 };
      return { results: [], diagnostic };
    }));

    return {
      results: settled.flatMap(({ results }) => results),
      diagnostics: settled.map(({ diagnostic }) => diagnostic),
    };
  }
}
