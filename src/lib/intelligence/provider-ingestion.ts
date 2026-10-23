import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { db } from "@/lib/db/pool";
import type { OrganizationActor } from "@/lib/operations/types";
import { synchronizeSourceRegistry } from "@/lib/platform/sources";
import {
  collectIntelligenceEvents,
  intelligenceEventProviderRegistry,
} from "./event-provider-registry";
import type { NormalizedIntelligenceEvent } from "./event-provider";

type IngestionOptions = {
  providerIds?: string[];
  since?: Date;
  limitPerProvider?: number;
};

type Row = Record<string, unknown>;

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Public feeds that a scheduled refresh can ingest without an organization. */
export function publicIntelligenceProviderIds(): string[] {
  return intelligenceEventProviderRegistry
    .selected()
    .filter((provider) => provider.mode === "FREE")
    .map((provider) => provider.id);
}

function organizationScope(
  actor: OrganizationActor | null,
  event: NormalizedIntelligenceEvent,
): string | null {
  const provider = intelligenceEventProviderRegistry
    .catalog()
    .find((candidate) => candidate.id === event.providerId);
  if (!provider)
    throw new Error(`Unknown intelligence provider: ${event.providerId}`);
  if (provider.mode === "FREE") return null;
  if (!actor)
    throw new Error(`Provider ${event.providerId} needs an organization.`);
  return actor.organizationId;
}

// Each table is written with one statement per scope instead of one per row:
// a refresh of ~300 events was ~1,500 sequential round trips (about 100 s).
function batch<T extends Row>(
  client: PoolClient,
  sql: string,
  rows: T[],
) {
  return client.query(sql, [JSON.stringify(rows)]);
}

const EVENT_COLUMNS =
  "organization_id,visibility,event_type,category,title,description,summary,event_status,occurred_at,expected_end_at,latitude,longitude,geometry,severity,confidence,deduplication_key,verification_state,primary_provider_id,source_count,normalized_entities,raw_evidence_refs,attributes,metadata";
const OBSERVATION_COLUMNS =
  "organization_id,event_id,source_id,provider_id,provider_record_id,source_url,observed_at,retrieved_at,content_hash,payload,raw_reference,confidence";
const EVIDENCE_COLUMNS =
  "organization_id,evidence_type,verification_state,source_id,provider_id,title,description,source_url,content_hash,retrieved_at,original_timestamp,created_by_user_id,metadata";

function eventRow(
  normalized: NormalizedIntelligenceEvent,
  scopedOrganizationId: string | null,
): Row {
  const { latitude, longitude, label } = normalized.location;
  return {
    organization_id: scopedOrganizationId,
    visibility: scopedOrganizationId ? "organization_private" : "global",
    event_type: normalized.eventType,
    category: normalized.pack,
    title: normalized.title,
    description: normalized.summary,
    summary: normalized.summary,
    event_status: "active",
    occurred_at: normalized.startedAt ?? null,
    expected_end_at: normalized.expectedEndAt ?? null,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    geometry:
      latitude !== undefined && longitude !== undefined
        ? {
            type: "Point",
            coordinates: [longitude, latitude],
            ...(label ? { label } : {}),
          }
        : label
          ? { label }
          : null,
    severity: normalized.severity,
    confidence: normalized.confidence,
    deduplication_key: normalized.deduplicationKey,
    verification_state: normalized.verificationState,
    primary_provider_id: normalized.providerId,
    source_count: normalized.sources.length,
    normalized_entities: normalized.entities,
    raw_evidence_refs: normalized.rawEvidenceRefs,
    attributes: normalized.attributes,
    metadata: { providerId: normalized.providerId, pack: normalized.pack },
  };
}

export async function ingestIntelligenceEvents(
  actor: OrganizationActor | null,
  options: IngestionOptions = {},
) {
  await synchronizeSourceRegistry();
  const collected = await collectIntelligenceEvents(options);
  const client = await db().connect();
  const startedAt = Date.now();
  const scopes = new Map(
    collected.events.map((event) => [
      event.deduplicationKey,
      organizationScope(actor, event),
    ]),
  );

  // Providers outside the production source catalog (GDACS, FAA, AWC,
  // specialist feeds) still need a source row for the foreign keys below.
  const sources = new Map<string, Row>();
  for (const provider of intelligenceEventProviderRegistry.catalog())
    sources.set(provider.sourceId, {
      id: provider.sourceId,
      name: provider.name.slice(0, 240),
      reliability_level: "unverified",
    });
  for (const normalized of collected.events)
    for (const source of normalized.sources)
      sources.set(source.id, {
        id: source.id,
        name: source.name.slice(0, 240),
        reliability_level: source.sourceType,
      });

  try {
    await client.query("begin");

    await batch(
      client,
      `insert into public.ophanim_sources(id,name,category,reliability_level,metadata)
       select id,name,'intelligence_provider',reliability_level,'{"registeredBy":"provider_ingestion"}'::jsonb
       from jsonb_to_recordset($1::jsonb) as s(id text,name text,reliability_level text)
       on conflict(id) do nothing`,
      [...sources.values()],
    );

    const eventIds = new Map<string, string>();
    for (const scoped of [false, true]) {
      const rows = collected.events
        .filter((event) => Boolean(scopes.get(event.deduplicationKey)) === scoped)
        .map((event) => eventRow(event, scopes.get(event.deduplicationKey) ?? null));
      if (!rows.length) continue;
      const result = await batch(
        client,
        `insert into public.ophanim_events(${EVENT_COLUMNS})
         select ${EVENT_COLUMNS} from jsonb_populate_recordset(null::public.ophanim_events, $1::jsonb)
         on conflict ${
           scoped
             ? "(organization_id, event_type, deduplication_key) where organization_id is not null and deduplication_key is not null"
             : "(event_type, deduplication_key) where organization_id is null and deduplication_key is not null"
         }
         do update set
           title=excluded.title, description=excluded.description, summary=excluded.summary,
           event_status=excluded.event_status, occurred_at=excluded.occurred_at,
           expected_end_at=excluded.expected_end_at, latitude=excluded.latitude,
           longitude=excluded.longitude, geometry=excluded.geometry, severity=excluded.severity,
           confidence=excluded.confidence, verification_state=excluded.verification_state,
           primary_provider_id=excluded.primary_provider_id, source_count=excluded.source_count,
           normalized_entities=excluded.normalized_entities, raw_evidence_refs=excluded.raw_evidence_refs,
           attributes=excluded.attributes, metadata=excluded.metadata, updated_at=now()
         returning id, deduplication_key`,
        rows,
      );
      for (const row of result.rows) eventIds.set(row.deduplication_key, row.id);
    }

    // Later rows win for duplicate keys, as the old row-by-row upserts did.
    const observations = new Map<string, Row>();
    const eventSources = new Map<string, { eventId: string; sourceId: string; observationKey: string }>();
    const evidence = new Map<string, Row>();
    const evidenceEvents = new Map<string, Set<string>>();
    let evidenceRecords = 0;

    for (const normalized of collected.events) {
      const scopedOrganizationId = scopes.get(normalized.deduplicationKey) ?? null;
      const eventId = eventIds.get(normalized.deduplicationKey);
      if (!eventId) throw new Error(`Event ${normalized.deduplicationKey} was not saved.`);
      for (const source of normalized.sources) {
        const rawReference =
          normalized.rawEvidenceRefs.find(
            (reference) => reference.sourceUrl === source.url,
          ) ?? normalized.rawEvidenceRefs[0];
        const providerRecordId =
          rawReference?.providerRecordId ?? normalized.externalId;
        const contentHash = hash({
          sourceId: source.id,
          providerId: normalized.providerId,
          providerRecordId,
          normalized,
        });

        const observationKey = `${scopedOrganizationId ?? ""}|${source.id}|${providerRecordId}`;
        observations.set(observationKey, {
          organization_id: scopedOrganizationId,
          event_id: eventId,
          source_id: source.id,
          provider_id: normalized.providerId,
          provider_record_id: providerRecordId,
          source_url: source.url ?? null,
          observed_at: normalized.startedAt ?? null,
          retrieved_at: source.retrievedAt,
          content_hash: contentHash,
          payload: normalized,
          raw_reference: rawReference ?? {},
          confidence: normalized.confidence,
        });
        eventSources.set(`${eventId}|${source.id}`, {
          eventId,
          sourceId: source.id,
          observationKey,
        });

        const evidenceKey = `${scopedOrganizationId ?? ""}|${normalized.providerId}|${contentHash}`;
        evidence.set(evidenceKey, {
          organization_id: scopedOrganizationId,
          evidence_type: "provider_record",
          verification_state: "source_record",
          source_id: source.id,
          provider_id: normalized.providerId,
          title: normalized.title,
          description: normalized.summary,
          source_url: source.url ?? null,
          content_hash: contentHash,
          retrieved_at: source.retrievedAt,
          original_timestamp: source.publishedAt ?? normalized.startedAt ?? null,
          created_by_user_id: scopedOrganizationId ? actor?.userId ?? null : null,
          metadata: {
            providerRecordId,
            sourceType: source.sourceType,
            verificationState: normalized.verificationState,
            rawReference: rawReference ?? null,
          },
        });
        evidenceEvents.set(
          evidenceKey,
          (evidenceEvents.get(evidenceKey) ?? new Set()).add(eventId),
        );
        evidenceRecords += 1;
      }
    }

    const observationIds = new Map<string, string>();
    if (observations.size) {
      const result = await batch(
        client,
        `insert into public.ophanim_observations(${OBSERVATION_COLUMNS})
         select ${OBSERVATION_COLUMNS} from jsonb_populate_recordset(null::public.ophanim_observations, $1::jsonb)
         on conflict (organization_id,source_id,provider_record_id) do update set
           event_id=excluded.event_id,source_url=excluded.source_url,observed_at=excluded.observed_at,
           retrieved_at=excluded.retrieved_at,content_hash=excluded.content_hash,
           payload=excluded.payload,raw_reference=excluded.raw_reference,confidence=excluded.confidence
         returning id, organization_id, source_id, provider_record_id`,
        [...observations.values()],
      );
      for (const row of result.rows)
        observationIds.set(
          `${row.organization_id ?? ""}|${row.source_id}|${row.provider_record_id}`,
          row.id,
        );
    }

    if (eventSources.size)
      await batch(
        client,
        `insert into public.ophanim_event_sources(event_id,source_id,observation_id)
         select event_id,source_id,observation_id
         from jsonb_populate_recordset(null::public.ophanim_event_sources, $1::jsonb)
         on conflict(event_id,source_id) do update set observation_id=excluded.observation_id`,
        [...eventSources.values()].map((link) => ({
          event_id: link.eventId,
          source_id: link.sourceId,
          observation_id: observationIds.get(link.observationKey) ?? null,
        })),
      );

    const evidenceLinks: Row[] = [];
    for (const scoped of [false, true]) {
      const entries = [...evidence.entries()].filter(
        ([, row]) => Boolean(row.organization_id) === scoped,
      );
      if (!entries.length) continue;
      const result = await batch(
        client,
        `insert into public.ophanim_evidence(${EVIDENCE_COLUMNS})
         select ${EVIDENCE_COLUMNS} from jsonb_populate_recordset(null::public.ophanim_evidence, $1::jsonb)
         on conflict ${
           scoped
             ? "(organization_id,provider_id,content_hash) where organization_id is not null and provider_id is not null and content_hash is not null"
             : "(provider_id,content_hash) where organization_id is null and provider_id is not null and content_hash is not null"
         }
         do update set title=excluded.title,description=excluded.description,
           source_url=excluded.source_url,retrieved_at=excluded.retrieved_at,
           original_timestamp=excluded.original_timestamp,metadata=excluded.metadata
         returning id, organization_id, provider_id, content_hash`,
        entries.map(([, row]) => row),
      );
      for (const row of result.rows) {
        const key = `${row.organization_id ?? ""}|${row.provider_id}|${row.content_hash}`;
        for (const eventId of evidenceEvents.get(key) ?? [])
          evidenceLinks.push({
            evidence_id: row.id,
            resource_type: "event",
            resource_id: eventId,
          });
      }
    }
    if (evidenceLinks.length)
      await batch(
        client,
        `insert into public.ophanim_evidence_links(evidence_id,resource_type,resource_id)
         select evidence_id,resource_type,resource_id
         from jsonb_populate_recordset(null::public.ophanim_evidence_links, $1::jsonb)
         on conflict do nothing`,
        evidenceLinks,
      );

    const catalog = intelligenceEventProviderRegistry.catalog();
    const diagnostics = collected.diagnostics.map((diagnostic) => ({
      provider_id: diagnostic.providerId,
      source_id:
        catalog.find((provider) => provider.id === diagnostic.providerId)
          ?.sourceId ?? null,
      status: diagnostic.status,
      duration_ms: diagnostic.durationMs,
      message: diagnostic.message ?? null,
    }));
    if (diagnostics.length) {
      await batch(
        client,
        `insert into public.ophanim_provider_metric_samples(
           provider_id,source_id,requests,successes,failures,timeouts,latency_ms,last_error
         )
         select provider_id,source_id,1,
           case when status='success' then 1 else 0 end,
           case when status='error' then 1 else 0 end,
           case when status='error' and lower(coalesce(message,'')) like '%abort%' then 1 else 0 end,
           duration_ms,message
         from jsonb_to_recordset($1::jsonb)
           as d(provider_id text,source_id text,status text,duration_ms integer,message text)`,
        diagnostics,
      );
      await batch(
        client,
        `update public.ophanim_sources s set
           last_success_at=case when d.status='success' then now() else s.last_success_at end,
           last_failure_at=case when d.status='error' then now() else s.last_failure_at end,
           last_error=case when d.status='error' then d.message else null end,
           updated_at=now()
         from jsonb_to_recordset($1::jsonb) as d(source_id text,status text,message text)
         where s.id=d.source_id`,
        diagnostics.filter(
          (diagnostic) => diagnostic.source_id && diagnostic.status !== "skipped",
        ),
      );
    }

    await client.query(
      `insert into public.ophanim_job_runs(
         job_key,organization_id,status,started_at,completed_at,duration_ms,metadata
       ) values('intelligence_provider_ingestion',$1,'completed',$3,now(),$4,$2)`,
      [
        actor?.organizationId ?? null,
        JSON.stringify({
          diagnostics: collected.diagnostics,
          eventCount: eventIds.size,
          evidenceCount: evidenceRecords,
          scheduled: !actor,
        }),
        new Date(startedAt),
        Date.now() - startedAt,
      ],
    );
    await client.query("commit");
    return {
      eventsProcessed: eventIds.size,
      evidenceRecords,
      diagnostics: collected.diagnostics,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
