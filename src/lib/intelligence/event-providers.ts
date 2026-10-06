import {
  clampScore,
  configuredHttpUrl,
  type IntelligenceEventProvider,
  type IntelligencePack,
  type IntelligenceSource,
  type ProviderCostType,
  type ProviderMode,
} from "./event-provider";

type UsgsFeature = {
  id?: string;
  properties?: {
    mag?: number;
    place?: string;
    time?: number;
    updated?: number;
    url?: string;
    alert?: string;
    status?: string;
    tsunami?: number;
    type?: string;
  };
  geometry?: { type?: string; coordinates?: number[] };
};
type UsgsResponse = { features?: UsgsFeature[] };

export const usgsEarthquakeProvider: IntelligenceEventProvider<UsgsResponse> = {
  id: "usgs-earthquakes",
  name: "USGS Earthquake Hazards",
  pack: "weather_disaster",
  costType: "free",
  mode: "FREE",
  sourceId: "usgs-earthquakes",
  supportedEventTypes: ["earthquake"],
  requiresCredentials: false,
  timeoutMs: 8000,
  isConfigured: () => true,
  async fetch(context) {
    const response = await fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
      {
        signal: context.signal,
        headers: { Accept: "application/geo+json, application/json" },
      },
    );
    if (!response.ok) throw new Error(`USGS returned ${response.status}.`);
    return response.json() as Promise<UsgsResponse>;
  },
  normalize(raw, context) {
    return (raw.features ?? []).slice(0, context.limit).flatMap((feature) => {
      const id = feature.id?.trim();
      const properties = feature.properties;
      const coordinates = feature.geometry?.coordinates;
      if (
        !id ||
        !properties?.place ||
        !Array.isArray(coordinates) ||
        coordinates.length < 2
      )
        return [];
      const magnitude = Number(properties.mag ?? 0);
      const startedAt = properties.time
        ? new Date(properties.time).toISOString()
        : undefined;
      const sourceUrl = properties.url;
      const source: IntelligenceSource = {
        id: "usgs-earthquakes",
        name: "USGS Earthquake Hazards",
        sourceType: "primary_authority",
        ...(sourceUrl ? { url: sourceUrl } : {}),
        ...(startedAt ? { publishedAt: startedAt } : {}),
        retrievedAt: context.now.toISOString(),
      };
      const reviewed = properties.status === "reviewed";
      return [
        {
          externalId: `usgs:${id}`,
          providerId: "usgs-earthquakes",
          organizationScope: null,
          pack: "weather_disaster" as const,
          eventType: "earthquake",
          title: `M${magnitude.toFixed(1)} earthquake near ${properties.place}`,
          summary: `USGS reported a magnitude ${magnitude.toFixed(1)} earthquake near ${properties.place}${properties.tsunami ? " with a tsunami flag" : ""}.`,
          entities: [{ type: "location" as const, value: properties.place }],
          location: {
            longitude: Number(coordinates[0]),
            latitude: Number(coordinates[1]),
            label: properties.place,
          },
          ...(startedAt ? { startedAt } : {}),
          severity: clampScore(
            magnitude * 12 +
              (properties.tsunami ? 15 : 0) +
              (properties.alert === "red"
                ? 20
                : properties.alert === "orange"
                  ? 12
                  : 0),
          ),
          confidence: reviewed ? 95 : 82,
          verificationState: reviewed
            ? ("confirmed" as const)
            : ("likely" as const),
          sources: [source],
          rawEvidenceRefs: [
            { providerRecordId: id, ...(sourceUrl ? { sourceUrl } : {}) },
          ],
          deduplicationKey: `usgs:${id}`,
          attributes: {
            magnitude,
            depthKm: coordinates[2] ?? null,
            tsunami: Boolean(properties.tsunami),
            reviewStatus: properties.status ?? "unknown",
          },
        },
      ];
    });
  },
};

type EonetEvent = {
  id?: string;
  title?: string;
  description?: string;
  link?: string;
  closed?: string;
  categories?: Array<{ id?: string; title?: string }>;
  sources?: Array<{ id?: string; url?: string }>;
  geometry?: Array<{ date?: string; type?: string; coordinates?: number[] }>;
};
type EonetResponse = { events?: EonetEvent[] };

const eonetTypes: Record<string, string> = {
  severeStorms: "severe_storm",
  wildfires: "wildfire",
  volcanoes: "volcanic_activity",
  floods: "flood",
  seaLakeIce: "sea_ice",
  drought: "drought",
  dustHaze: "dust_haze",
  landslides: "landslide",
  snow: "extreme_snow",
  tempExtremes: "temperature_extreme",
  waterColor: "water_event",
};

export const nasaEonetProvider: IntelligenceEventProvider<EonetResponse> = {
  id: "nasa-eonet",
  name: "NASA EONET",
  pack: "weather_disaster",
  costType: "free",
  mode: "FREE",
  sourceId: "nasa-firms-eonet",
  supportedEventTypes: Object.values(eonetTypes),
  requiresCredentials: false,
  timeoutMs: 8000,
  isConfigured: () => true,
  async fetch(context) {
    const response = await fetch(
      `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=${Math.min(context.limit, 100)}`,
      { signal: context.signal, headers: { Accept: "application/json" } },
    );
    if (!response.ok)
      throw new Error(`NASA EONET returned ${response.status}.`);
    return response.json() as Promise<EonetResponse>;
  },
  normalize(raw, context) {
    return (raw.events ?? []).slice(0, context.limit).flatMap((event) => {
      const id = event.id?.trim();
      const title = event.title?.trim();
      if (!id || !title) return [];
      const category = event.categories?.[0];
      const eventType = eonetTypes[category?.id ?? ""] ?? "natural_hazard";
      const geometry = event.geometry?.at(-1);
      const coordinates =
        geometry?.type === "Point" && Array.isArray(geometry.coordinates)
          ? geometry.coordinates
          : undefined;
      const startedAt = event.geometry?.[0]?.date;
      const sources: IntelligenceSource[] = (event.sources ?? []).flatMap(
        (source) =>
          source.url
            ? [
                {
                  id: "nasa-firms-eonet",
                  name: source.id ? `NASA EONET / ${source.id}` : "NASA EONET",
                  url: source.url,
                  sourceType: "primary_authority" as const,
                  ...(startedAt ? { publishedAt: startedAt } : {}),
                  retrievedAt: context.now.toISOString(),
                },
              ]
            : [],
      );
      if (!sources.length)
        sources.push({
          id: "nasa-firms-eonet",
          name: "NASA EONET",
          ...(event.link ? { url: event.link } : {}),
          sourceType: "primary_authority",
          ...(startedAt ? { publishedAt: startedAt } : {}),
          retrievedAt: context.now.toISOString(),
        });
      return [
        {
          externalId: `eonet:${id}`,
          providerId: "nasa-eonet",
          organizationScope: null,
          pack: "weather_disaster" as const,
          eventType,
          title,
          summary:
            event.description?.trim() ||
            `${category?.title ?? "Natural hazard"} tracked by NASA EONET.`,
          entities: [{ type: "location" as const, value: title }],
          location: coordinates
            ? {
                longitude: Number(coordinates[0]),
                latitude: Number(coordinates[1]),
                label: title,
              }
            : { label: title },
          ...(startedAt ? { startedAt } : {}),
          ...(event.closed ? { expectedEndAt: event.closed } : {}),
          severity:
            eventType === "severe_storm" || eventType === "volcanic_activity"
              ? 65
              : 55,
          confidence: 82,
          verificationState: "likely" as const,
          sources,
          rawEvidenceRefs: [
            {
              providerRecordId: id,
              ...(event.link ? { sourceUrl: event.link } : {}),
            },
          ],
          deduplicationKey: `eonet:${id}`,
          attributes: {
            category: category?.title ?? null,
            geometryType: geometry?.type ?? null,
          },
        },
      ];
    });
  },
};

type KevEntry = {
  cveID?: string;
  vendorProject?: string;
  product?: string;
  vulnerabilityName?: string;
  dateAdded?: string;
  shortDescription?: string;
  requiredAction?: string;
  dueDate?: string;
  knownRansomwareCampaignUse?: string;
  notes?: string;
};
type KevResponse = { vulnerabilities?: KevEntry[] };

export const cisaKevProvider: IntelligenceEventProvider<KevResponse> = {
  id: "cisa-kev",
  name: "CISA Known Exploited Vulnerabilities",
  pack: "cyber_threat",
  costType: "free",
  mode: "FREE",
  sourceId: "cisa-kev",
  supportedEventTypes: ["known_exploited_vulnerability"],
  requiresCredentials: false,
  timeoutMs: 8000,
  isConfigured: () => true,
  async fetch(context) {
    const response = await fetch(
      "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      { signal: context.signal, headers: { Accept: "application/json" } },
    );
    if (!response.ok) throw new Error(`CISA KEV returned ${response.status}.`);
    return response.json() as Promise<KevResponse>;
  },
  normalize(raw, context) {
    return (raw.vulnerabilities ?? [])
      .filter(
        (entry) =>
          entry.dateAdded &&
          Date.parse(entry.dateAdded) >= context.since.getTime(),
      )
      .slice(0, context.limit)
      .flatMap((entry) => {
        const cve = entry.cveID?.trim();
        const title = entry.vulnerabilityName?.trim();
        if (!cve || !title || !entry.dateAdded) return [];
        const sourceUrl = `https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext=${encodeURIComponent(cve)}`;
        const ransomware =
          entry.knownRansomwareCampaignUse?.toLowerCase() === "known";
        return [
          {
            externalId: `cisa-kev:${cve.toLowerCase()}`,
            providerId: "cisa-kev",
            organizationScope: null,
            pack: "cyber_threat" as const,
            eventType: "known_exploited_vulnerability",
            title,
            summary:
              entry.shortDescription?.trim() ||
              `${cve} was added to the CISA Known Exploited Vulnerabilities catalog.`,
            entities: [
              { type: "cve" as const, value: cve },
              ...(entry.vendorProject
                ? [{ type: "company" as const, value: entry.vendorProject }]
                : []),
              ...(entry.product
                ? [{ type: "product" as const, value: entry.product }]
                : []),
            ],
            location: {},
            startedAt: new Date(`${entry.dateAdded}T00:00:00Z`).toISOString(),
            ...(entry.dueDate
              ? {
                  expectedEndAt: new Date(
                    `${entry.dueDate}T23:59:59Z`,
                  ).toISOString(),
                }
              : {}),
            severity: ransomware ? 88 : 76,
            confidence: 100,
            verificationState: "confirmed" as const,
            sources: [
              {
                id: "cisa-kev",
                name: "CISA Known Exploited Vulnerabilities",
                url: sourceUrl,
                sourceType: "primary_authority" as const,
                publishedAt: new Date(
                  `${entry.dateAdded}T00:00:00Z`,
                ).toISOString(),
                retrievedAt: context.now.toISOString(),
              },
            ],
            rawEvidenceRefs: [{ providerRecordId: cve, sourceUrl }],
            deduplicationKey: `cisa-kev:${cve.toLowerCase()}`,
            attributes: {
              cve,
              vendor: entry.vendorProject ?? null,
              product: entry.product ?? null,
              requiredAction: entry.requiredAction ?? null,
              knownRansomwareUse: ransomware,
              notes: entry.notes ?? null,
            },
          },
        ];
      });
  },
};

type ConfiguredRecord = Record<string, unknown>;

function stringValue(
  record: ConfiguredRecord,
  ...keys: string[]
): string | undefined {
  for (const key of keys)
    if (typeof record[key] === "string" && record[key].trim())
      return record[key].trim();
  return undefined;
}

function numberValue(
  record: ConfiguredRecord,
  key: string,
  fallback: number,
): number {
  const value = Number(record[key]);
  return Number.isFinite(value) ? clampScore(value) : fallback;
}

function records(raw: unknown): ConfiguredRecord[] {
  if (Array.isArray(raw))
    return raw.filter(
      (item): item is ConfiguredRecord =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    );
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as ConfiguredRecord).events)
  )
    return records((raw as ConfiguredRecord).events);
  return [];
}

function configuredFeedProvider(input: {
  id: string;
  name: string;
  pack: IntelligencePack;
  sourceId: string;
  env: string;
  costType: ProviderCostType;
  mode: ProviderMode;
  eventType: string;
  sourceType: IntelligenceSource["sourceType"];
}): IntelligenceEventProvider<unknown> {
  return {
    ...input,
    supportedEventTypes: [input.eventType],
    requiresCredentials: true,
    timeoutMs: 10000,
    isConfigured: () => Boolean(configuredHttpUrl(input.env)),
    async fetch(context) {
      const url = configuredHttpUrl(input.env);
      if (!url) throw new Error(`${input.env} is not configured.`);
      const response = await fetch(url, {
        signal: context.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok)
        throw new Error(`${input.name} returned ${response.status}.`);
      return response.json();
    },
    normalize(raw, context) {
      return records(raw)
        .slice(0, context.limit)
        .flatMap((record) => {
          const id = stringValue(record, "id", "external_id", "reference");
          const title = stringValue(record, "title", "name");
          if (!id || !title) return [];
          const sourceUrl = stringValue(record, "source_url", "url");
          const startedAt = stringValue(
            record,
            "started_at",
            "published_at",
            "occurred_at",
          );
          const expectedEndAt = stringValue(
            record,
            "expected_end_at",
            "ends_at",
          );
          const latitude = Number(record.latitude);
          const longitude = Number(record.longitude);
          const normalizedId = id
            .toLowerCase()
            .replace(/[^a-z0-9_.:-]+/g, "-")
            .slice(0, 180);
          return [
            {
              externalId: `${input.id}:${normalizedId}`,
              providerId: input.id,
              organizationScope: null,
              pack: input.pack,
              eventType:
                stringValue(record, "event_type", "type")
                  ?.toLowerCase()
                  .replace(/[^a-z0-9_.-]+/g, "_") ?? input.eventType,
              title,
              summary:
                stringValue(record, "summary", "description") ??
                `${title} was reported by ${input.name}.`,
              entities: Array.isArray(record.entities)
                ? record.entities.flatMap((entity) =>
                    typeof entity === "string"
                      ? [{ type: "other" as const, value: entity }]
                      : [],
                  )
                : [],
              location: {
                ...(Number.isFinite(latitude) && Number.isFinite(longitude)
                  ? { latitude, longitude }
                  : {}),
                ...(stringValue(record, "location", "place")
                  ? { label: stringValue(record, "location", "place") }
                  : {}),
              },
              ...(startedAt ? { startedAt } : {}),
              ...(expectedEndAt ? { expectedEndAt } : {}),
              severity: numberValue(record, "severity", 50),
              confidence: numberValue(record, "confidence", 60),
              verificationState:
                record.verification_state === "confirmed" ||
                record.verification_state === "likely" ||
                record.verification_state === "conflicting"
                  ? record.verification_state
                  : "unverified",
              sources: [
                {
                  id: input.sourceId,
                  name: input.name,
                  ...(sourceUrl ? { url: sourceUrl } : {}),
                  sourceType: input.sourceType,
                  ...(startedAt ? { publishedAt: startedAt } : {}),
                  retrievedAt: context.now.toISOString(),
                },
              ],
              rawEvidenceRefs: [
                { providerRecordId: id, ...(sourceUrl ? { sourceUrl } : {}) },
              ],
              deduplicationKey: `${input.id}:${normalizedId}`,
              attributes: { upstream: record },
            },
          ];
        });
    },
  };
}

export const maritimePortProvider = configuredFeedProvider({
  id: "official-port-notices",
  name: "Official port notices",
  pack: "maritime_port",
  sourceId: "official-port-notices",
  env: "PORT_NOTICE_FEED_URL",
  costType: "customer_hosted",
  mode: "CUSTOMER_HOSTED",
  eventType: "port_disruption",
  sourceType: "direct_operator",
});
export const officialSanctionsProvider = configuredFeedProvider({
  id: "official-sanctions-events",
  name: "Official sanctions feeds",
  pack: "sanctions",
  sourceId: "official-sanctions",
  env: "OFFICIAL_SANCTIONS_FEED_URL",
  costType: "customer_hosted",
  mode: "CUSTOMER_HOSTED",
  eventType: "sanctions_update",
  sourceType: "primary_authority",
});
export const reviewedOsintProvider = configuredFeedProvider({
  id: "reviewed-osint-events",
  name: "Reviewed news and OSINT",
  pack: "osint_news",
  sourceId: "reviewed-news",
  env: "REVIEWED_OSINT_FEED_URL",
  costType: "customer_hosted",
  mode: "CUSTOMER_HOSTED",
  eventType: "osint_report",
  sourceType: "osint",
});

export const defaultIntelligenceEventProviders: IntelligenceEventProvider[] = [
  usgsEarthquakeProvider,
  nasaEonetProvider,
  cisaKevProvider,
  maritimePortProvider,
  officialSanctionsProvider,
  reviewedOsintProvider,
];
