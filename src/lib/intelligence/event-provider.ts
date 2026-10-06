export const INTELLIGENCE_PACKS = [
  "weather_disaster",
  "maritime_port",
  "sanctions",
  "osint_news",
  "cyber_threat",
] as const;

export type IntelligencePack = (typeof INTELLIGENCE_PACKS)[number];
export type ProviderCostType = "free" | "customer_paid" | "customer_hosted";
export type ProviderMode = "FREE" | "CUSTOMER_KEY" | "CUSTOMER_HOSTED";
export type IntelligenceVerificationState =
  | "confirmed"
  | "likely"
  | "unverified"
  | "conflicting";

export type IntelligenceEntity = {
  type:
    | "location"
    | "port"
    | "vessel"
    | "imo"
    | "mmsi"
    | "company"
    | "product"
    | "cve"
    | "country"
    | "other";
  value: string;
  label?: string;
};

export type IntelligenceLocation = {
  latitude?: number;
  longitude?: number;
  label?: string;
  countryCode?: string;
};

export type IntelligenceSource = {
  id: string;
  name: string;
  url?: string;
  sourceType:
    | "primary_authority"
    | "direct_operator"
    | "original_source"
    | "trusted_news"
    | "osint"
    | "unverified";
  publishedAt?: string;
  retrievedAt: string;
};

export type RawEvidenceReference = {
  providerRecordId: string;
  sourceUrl?: string;
  snapshotReference?: string;
};

export type NormalizedIntelligenceEvent = {
  externalId: string;
  providerId: string;
  organizationScope: string | null;
  pack: IntelligencePack;
  eventType: string;
  title: string;
  summary: string;
  entities: IntelligenceEntity[];
  location: IntelligenceLocation;
  startedAt?: string;
  expectedEndAt?: string;
  severity: number;
  confidence: number;
  verificationState: IntelligenceVerificationState;
  sources: IntelligenceSource[];
  rawEvidenceRefs: RawEvidenceReference[];
  deduplicationKey: string;
  attributes: Record<string, unknown>;
};

export type IntelligenceProviderContext = {
  signal: AbortSignal;
  now: Date;
  since: Date;
  limit: number;
};

export type IntelligenceEventProvider<Raw = unknown> = {
  id: string;
  name: string;
  pack: IntelligencePack;
  costType: ProviderCostType;
  mode: ProviderMode;
  sourceId: string;
  supportedEventTypes: string[];
  requiresCredentials: boolean;
  timeoutMs: number;
  isConfigured(): boolean;
  fetch(context: IntelligenceProviderContext): Promise<Raw>;
  normalize(
    raw: Raw,
    context: IntelligenceProviderContext,
  ): NormalizedIntelligenceEvent[];
  healthCheck?(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    message?: string;
  }>;
};

const keyPattern = /^[a-z0-9][a-z0-9_.:-]{0,239}$/i;

function validDate(value: string | undefined, field: string): void {
  if (value && !Number.isFinite(Date.parse(value)))
    throw new Error(`${field} must be an ISO date.`);
}

function validUrl(value: string | undefined, field: string): void {
  if (!value) return;
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(`${field} must be a safe HTTP(S) URL.`);
  }
}

export function validateNormalizedIntelligenceEvent(
  event: NormalizedIntelligenceEvent,
): NormalizedIntelligenceEvent {
  if (!keyPattern.test(event.externalId))
    throw new Error("External event ID is invalid.");
  if (!keyPattern.test(event.providerId))
    throw new Error("Provider ID is invalid.");
  if (!keyPattern.test(event.eventType))
    throw new Error("Event type is invalid.");
  if (!keyPattern.test(event.deduplicationKey))
    throw new Error("Deduplication key is invalid.");
  if (!INTELLIGENCE_PACKS.includes(event.pack))
    throw new Error("Intelligence pack is invalid.");
  if (!event.title.trim() || event.title.length > 1000)
    throw new Error("Event title is invalid.");
  if (!event.summary.trim() || event.summary.length > 10000)
    throw new Error("Event summary is invalid.");
  if (
    !Number.isInteger(event.severity) ||
    event.severity < 0 ||
    event.severity > 100
  )
    throw new Error("Severity must be an integer from 0 to 100.");
  if (
    !Number.isInteger(event.confidence) ||
    event.confidence < 0 ||
    event.confidence > 100
  )
    throw new Error("Confidence must be an integer from 0 to 100.");
  if (
    !["confirmed", "likely", "unverified", "conflicting"].includes(
      event.verificationState,
    )
  )
    throw new Error("Verification state is invalid.");
  if (!event.sources.length)
    throw new Error("At least one source is required.");
  validDate(event.startedAt, "Event start");
  validDate(event.expectedEndAt, "Expected end");
  if (
    event.expectedEndAt &&
    event.startedAt &&
    Date.parse(event.expectedEndAt) < Date.parse(event.startedAt)
  )
    throw new Error("Expected end cannot precede the event start.");
  if (
    event.location.latitude !== undefined ||
    event.location.longitude !== undefined
  ) {
    const { latitude, longitude } = event.location;
    if (
      latitude === undefined ||
      longitude === undefined ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error("Event coordinates are invalid.");
    }
  }
  for (const source of event.sources) {
    if (!keyPattern.test(source.id)) throw new Error("Source ID is invalid.");
    validDate(source.publishedAt, "Source publication time");
    validDate(source.retrievedAt, "Source retrieval time");
    validUrl(source.url, "Source URL");
  }
  for (const reference of event.rawEvidenceRefs)
    validUrl(reference.sourceUrl, "Evidence source URL");
  return event;
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function configuredHttpUrl(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(`${name} must be a safe HTTP(S) URL.`);
  return url.toString();
}
