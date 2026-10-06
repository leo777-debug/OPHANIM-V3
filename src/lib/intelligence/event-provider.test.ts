import { describe, expect, it } from "vitest";
import {
  validateNormalizedIntelligenceEvent,
  type IntelligenceProviderContext,
  type NormalizedIntelligenceEvent,
} from "./event-provider";
import {
  cisaKevProvider,
  maritimePortProvider,
  usgsEarthquakeProvider,
} from "./event-providers";

const context: IntelligenceProviderContext = {
  signal: new AbortController().signal,
  now: new Date("2026-08-27T12:00:00.000Z"),
  since: new Date("2026-08-20T00:00:00.000Z"),
  limit: 20,
};

function validEvent(): NormalizedIntelligenceEvent {
  return {
    externalId: "provider:event-1",
    providerId: "provider",
    organizationScope: null,
    pack: "weather_disaster",
    eventType: "storm",
    title: "Port approach affected by severe weather",
    summary: "An authority reported severe weather near the port approach.",
    entities: [{ type: "port", value: "AEJEA" }],
    location: { latitude: 25.01, longitude: 55.05 },
    startedAt: "2026-08-27T10:00:00.000Z",
    severity: 65,
    confidence: 90,
    verificationState: "confirmed",
    sources: [
      {
        id: "provider",
        name: "Authority",
        sourceType: "primary_authority",
        retrievedAt: context.now.toISOString(),
      },
    ],
    rawEvidenceRefs: [{ providerRecordId: "event-1" }],
    deduplicationKey: "provider:event-1",
    attributes: {},
  };
}

describe("normalized intelligence events", () => {
  it("rejects unsafe coordinates and source URLs", () => {
    expect(() =>
      validateNormalizedIntelligenceEvent({
        ...validEvent(),
        location: { latitude: 91, longitude: 55 },
      }),
    ).toThrow("coordinates");
    const event = validEvent();
    event.sources[0] = { ...event.sources[0], url: "file:///secret.txt" };
    expect(() => validateNormalizedIntelligenceEvent(event)).toThrow(
      "safe HTTP",
    );
  });

  it("normalizes USGS records with provenance and stable deduplication", () => {
    const events = usgsEarthquakeProvider.normalize(
      {
        features: [
          {
            id: "abc123",
            properties: {
              mag: 6.1,
              place: "Northern Gulf",
              time: 1_787_836_800_000,
              status: "reviewed",
              url: "https://earthquake.usgs.gov/earthquakes/eventpage/abc123",
            },
            geometry: { type: "Point", coordinates: [55.1, 25.2, 12] },
          },
        ],
      },
      context,
    );
    expect(events[0]).toMatchObject({
      externalId: "usgs:abc123",
      deduplicationKey: "usgs:abc123",
      confidence: 95,
      verificationState: "confirmed",
    });
    expect(events[0].sources[0]).toMatchObject({
      id: "usgs-earthquakes",
      sourceType: "primary_authority",
    });
  });

  it("filters old CISA entries and retains remediation evidence", () => {
    const events = cisaKevProvider.normalize(
      {
        vulnerabilities: [
          {
            cveID: "CVE-2026-0001",
            vulnerabilityName: "Recent issue",
            dateAdded: "2026-08-25",
            requiredAction: "Apply updates",
          },
          {
            cveID: "CVE-2020-0001",
            vulnerabilityName: "Old issue",
            dateAdded: "2020-01-01",
          },
        ],
      },
      context,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      externalId: "cisa-kev:cve-2026-0001",
      confidence: 100,
      attributes: { requiredAction: "Apply updates" },
    });
  });

  it("discards customer-hosted records without a stable upstream ID", () => {
    expect(
      maritimePortProvider.normalize(
        { events: [{ title: "Temporary berth closure" }] },
        context,
      ),
    ).toEqual([]);
  });
});
