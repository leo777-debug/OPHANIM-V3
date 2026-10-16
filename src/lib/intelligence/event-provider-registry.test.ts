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
        message: "Provider failed. Check its configuration and health.",
      },
    ]);
  });

  it('isolates empty, malformed, credential-bearing and never-settling sources', async () => {
    const empty = provider('empty', 40); empty.normalize = () => [];
    const garbage = provider('garbage', 40); garbage.normalize = () => [null as unknown as NormalizedIntelligenceEvent];
    const leaking = provider('leaking', 40); leaking.fetch = async () => { throw new Error('synthetic-provider-private-token'); };
    const hung = provider('hung', 40); hung.timeoutMs = 20; hung.fetch = () => new Promise(() => {});
    const result = await collectIntelligenceEvents({}, new IntelligenceEventProviderRegistry([provider('healthy', 70), empty, garbage, leaking, hung]));
    expect(result.events).toHaveLength(1);
    expect(result.diagnostics.map((item) => [item.providerId, item.status])).toEqual([
      ['healthy', 'success'], ['empty', 'success'], ['garbage', 'error'], ['leaking', 'error'], ['hung', 'error'],
    ]);
    expect(result.diagnostics.at(-1)?.message).toBe('Provider timed out.');
    expect(JSON.stringify(result)).not.toContain('synthetic-provider-private-token');
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
