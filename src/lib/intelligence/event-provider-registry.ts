import { defaultIntelligenceEventProviders } from "./event-providers";
import { verifyEventProviders } from '@/lib/verify/providers';
import { specialistEventProviders } from './specialist-providers';
import { gdacsHazardProvider } from './gdacs-provider';
import { aviationEventProviders } from './aviation-providers';
import { MARITIME_NETWORK } from '@/lib/route-intelligence/open-network';
import { COUNTRY_REFERENCE } from './country-gazetteer';
export const registeredReferenceDatasets = [MARITIME_NETWORK, COUNTRY_REFERENCE];
import {
  validateNormalizedIntelligenceEvent,
  type IntelligenceEventProvider,
  type IntelligenceProviderContext,
  type NormalizedIntelligenceEvent,
} from "./event-provider";

export type ProviderIngestionDiagnostic = {
  providerId: string;
  status: "success" | "error" | "skipped";
  eventCount: number;
  durationMs: number;
  message?: string;
};

export class IntelligenceEventProviderRegistry {
  constructor(private readonly providers: IntelligenceEventProvider[]) {}

  catalog() {
    return this.providers.map((provider) => {
      let configured = false, warning: string | undefined;
      let compliance: ReturnType<NonNullable<IntelligenceEventProvider['compliance']>> | undefined;
      try { configured = provider.isConfigured(); compliance = provider.compliance?.(); } catch { configured = false; warning = 'Invalid provider configuration.'; }
      if (compliance && compliance.commercialUse !== 'yes') warning = 'Disabled: commercial use is not approved.';
      return {
        id: provider.id,
        name: provider.name,
        pack: provider.pack,
        costType: provider.costType,
        mode: provider.mode,
        sourceId: provider.sourceId,
        supportedEventTypes: provider.supportedEventTypes,
        requiresCredentials: provider.requiresCredentials,
        configured,
        enabled: configured && !warning,
        timeoutMs: provider.timeoutMs,
        compliance,
        warning,
      };
    });
  }

  selected(ids?: string[]): IntelligenceEventProvider[] {
    if (!ids?.length) return this.providers.filter((provider) => !provider.queryOnly);
    const allowed = new Set(ids);
    return this.providers.filter((provider) => allowed.has(provider.id));
  }
}

export const intelligenceEventProviderRegistry =
  new IntelligenceEventProviderRegistry([...defaultIntelligenceEventProviders, ...verifyEventProviders, ...specialistEventProviders, gdacsHazardProvider, ...aviationEventProviders]);

async function runProvider(
  provider: IntelligenceEventProvider,
  context: Omit<IntelligenceProviderContext, "signal">,
): Promise<{
  events: NormalizedIntelligenceEvent[];
  diagnostic: ProviderIngestionDiagnostic;
}> {
  const started = Date.now();
  let configured: boolean;
  let compliance: ReturnType<NonNullable<IntelligenceEventProvider['compliance']>> | undefined;
  try { configured = provider.isConfigured(); compliance = provider.compliance?.(); } catch {
    return { events: [], diagnostic: { providerId: provider.id, status: 'error', eventCount: 0, durationMs: 0, message: 'Invalid provider configuration.' } };
  }
  if (!configured || (compliance && compliance.commercialUse !== 'yes'))
    return {
      events: [],
      diagnostic: {
        providerId: provider.id,
        status: "skipped",
        eventCount: 0,
        durationMs: 0,
        message: compliance && compliance.commercialUse !== 'yes' ? 'Commercial use is unknown or not allowed; provider is disabled.' : "Provider is not configured.",
      },
    };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);
  try {
    const providerContext = { ...context, signal: controller.signal };
    const raw = await provider.fetch(providerContext);
    const events = provider
      .normalize(raw, providerContext)
      .map(validateNormalizedIntelligenceEvent);
    return {
      events,
      diagnostic: {
        providerId: provider.id,
        status: "success",
        eventCount: events.length,
        durationMs: Date.now() - started,
      },
    };
  } catch (error) {
    return {
      events: [],
      diagnostic: {
        providerId: provider.id,
        status: "error",
        eventCount: 0,
        durationMs: Date.now() - started,
        message: error instanceof Error ? error.message : "Provider failed.",
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectIntelligenceEvents(
  options: {
    providerIds?: string[];
    now?: Date;
    since?: Date;
    limitPerProvider?: number;
    parameters?: Record<string, string>;
  } = {},
  registry = intelligenceEventProviderRegistry,
) {
  const now = options.now ?? new Date();
  const context = {
    now,
    since: options.since ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    limit: Math.max(1, Math.min(options.limitPerProvider ?? 100, 500)),
    parameters: options.parameters,
  };
  const results = await Promise.all(
    registry
      .selected(options.providerIds)
      .map((provider) => runProvider(provider, context)),
  );
  const byKey = new Map<string, NormalizedIntelligenceEvent>();
  for (const result of results) {
    for (const event of result.events) {
      const current = byKey.get(event.deduplicationKey);
      if (
        !current ||
        event.confidence > current.confidence ||
        event.sources.length > current.sources.length
      )
        byKey.set(event.deduplicationKey, event);
    }
  }
  return {
    events: Array.from(byKey.values()),
    diagnostics: results.map((result) => result.diagnostic),
  };
}
