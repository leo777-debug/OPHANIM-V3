import { describe, expect, it } from "vitest";
import {
  collectIntelligenceEvents,
  IntelligenceEventProviderRegistry,
} from "./event-provider-registry";
import type {
  IntelligenceEventProvider,
  NormalizedIntelligenceEvent,
} from "./event-provider";

function event(
  providerId: string,
  confidence: number,
): NormalizedIntelligenceEvent {
  return {
    externalId: `${providerId}:shared`,
    providerId,
    organizationScope: null,
    pack: "osint_news",
    eventType: "port_notice",
    title: "Shared event",
    summary: "The same event was reported by multiple providers.",
    entities: [],
    location: {},
    severity: 50,
    confidence,
    verificationState: "likely",
    sources: [
      {
        id: providerId,
        name: providerId,
        sourceType: "original_source",
        retrievedAt: "2026-08-27T12:00:00.000Z",
      },
    ],
    rawEvidenceRefs: [{ providerRecordId: "shared" }],
    deduplicationKey: "shared:event",
    attributes: {},
  };
}

function provider(
  id: string,
  confidence: number,
  fails = false,
): IntelligenceEventProvider<unknown> {
  return {
    id,
    name: id,
    pack: "osint_news",
    costType: "free",
    mode: "FREE",
    sourceId: id,
    supportedEventTypes: ["port_notice"],
    requiresCredentials: false,
    timeoutMs: 500,
    isConfigured: () => true,
    fetch: async () => {
      if (fails) throw new Error("Upstream unavailable");
      return {};
    },
    normalize: () => [event(id, confidence)],
  };
}

describe("intelligence provider registry", () => {
  it("isolates provider failures and continues successful ingestion", async () => {
    const registry = new IntelligenceEventProviderRegistry([
      provider("healthy", 70),
      provider("failed", 80, true),
    ]);
    const result = await collectIntelligenceEvents(
      { now: new Date("2026-08-27T12:00:00.000Z") },
      registry,
    );
    expect(result.events).toHaveLength(1);
    expect(result.diagnostics).toMatchObject([
      { providerId: "healthy", status: "success", eventCount: 1 },
      {
        providerId: "failed",
        status: "error",
        eventCount: 0,
        message: "Upstream unavailable",
      },
    ]);
  });

  it("deduplicates normalized records and keeps the stronger report", async () => {
    const registry = new IntelligenceEventProviderRegistry([
      provider("first", 60),
      provider("second", 92),
    ]);
    const result = await collectIntelligenceEvents(
      { now: new Date("2026-08-27T12:00:00.000Z") },
      registry,
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      providerId: "second",
      confidence: 92,
    });
  });
});
