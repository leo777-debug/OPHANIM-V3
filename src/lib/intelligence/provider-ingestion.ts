import "server-only";
import { createHash } from "node:crypto";
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

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function organizationScope(
  actor: OrganizationActor,
  event: NormalizedIntelligenceEvent,
): string | null {
  const provider = intelligenceEventProviderRegistry
    .catalog()
    .find((candidate) => candidate.id === event.providerId);
  if (!provider)
    throw new Error(`Unknown intelligence provider: ${event.providerId}`);
  return provider.mode === "FREE" ? null : actor.organizationId;
}

export async function ingestIntelligenceEvents(
  actor: OrganizationActor,
  options: IngestionOptions = {},
) {
  await synchronizeSourceRegistry();
  const collected = await collectIntelligenceEvents(options);
  const client = await db().connect();
  const startedAt = Date.now();
  let insertedOrUpdated = 0;
  let evidenceRecords = 0;

  try {
    await client.query("begin");

    for (const normalized of collected.events) {
      const scopedOrganizationId = organizationScope(actor, normalized);
      const visibility = scopedOrganizationId
        ? "organization_private"
        : "global";
      const eventValues = [
        scopedOrganizationId,
        visibility,
        normalized.eventType,
        normalized.pack,
        normalized.title,
        normalized.summary,
        normalized.startedAt ?? null,
        normalized.expectedEndAt ?? null,
        normalized.location.latitude ?? null,
        normalized.location.longitude ?? null,
        normalized.location.latitude !== undefined &&
        normalized.location.longitude !== undefined
          ? JSON.stringify({
              type: "Point",
              coordinates: [
                normalized.location.longitude,
                normalized.location.latitude,
              ],
              ...(normalized.location.label
                ? { label: normalized.location.label }
                : {}),
            })
          : normalized.location.label
            ? JSON.stringify({ label: normalized.location.label })
            : null,
        normalized.severity,
        normalized.confidence,
        normalized.deduplicationKey,
        normalized.verificationState,
        normalized.providerId,
        normalized.sources.length,
        JSON.stringify(normalized.entities),
        JSON.stringify(normalized.rawEvidenceRefs),
        JSON.stringify(normalized.attributes),
        JSON.stringify({
          providerId: normalized.providerId,
          pack: normalized.pack,
        }),
      ];
      const eventSql = `insert into public.ophanim_events(
          organization_id, visibility, event_type, category, title, description, summary,
          event_status, occurred_at, expected_end_at, latitude, longitude, geometry, severity,
          confidence, deduplication_key, verification_state, primary_provider_id, source_count,
          normalized_entities, raw_evidence_refs, attributes, metadata
        ) values($1,$2,$3,$4,$5,$6,$6,'active',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        on conflict ${
          scopedOrganizationId
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
        returning id`;
      const eventResult = await client.query<{ id: string }>(
        eventSql,
        eventValues,
      );
      const eventId = eventResult.rows[0].id;
      insertedOrUpdated += 1;

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
        const observation = await client.query<{ id: string }>(
          `insert into public.ophanim_observations(
             organization_id,event_id,source_id,provider_id,provider_record_id,source_url,
             observed_at,retrieved_at,content_hash,payload,raw_reference,confidence
           ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           on conflict (organization_id,source_id,provider_record_id) do update set
             event_id=excluded.event_id,source_url=excluded.source_url,observed_at=excluded.observed_at,
             retrieved_at=excluded.retrieved_at,content_hash=excluded.content_hash,
             payload=excluded.payload,raw_reference=excluded.raw_reference,confidence=excluded.confidence
           returning id`,
          [
            scopedOrganizationId,
            eventId,
            source.id,
            normalized.providerId,
            providerRecordId,
            source.url ?? null,
            normalized.startedAt ?? null,
            source.retrievedAt,
            contentHash,
            JSON.stringify(normalized),
            JSON.stringify(rawReference ?? {}),
            normalized.confidence,
          ],
        );
        await client.query(
          `insert into public.ophanim_event_sources(event_id,source_id,observation_id)
           values($1,$2,$3)
           on conflict(event_id,source_id) do update set observation_id=excluded.observation_id`,
          [eventId, source.id, observation.rows[0].id],
        );

        const evidenceValues = [
          scopedOrganizationId,
          source.id,
          normalized.providerId,
          normalized.title,
          normalized.summary,
          source.url ?? null,
          contentHash,
          source.retrievedAt,
          source.publishedAt ?? normalized.startedAt ?? null,
          scopedOrganizationId ? actor.userId : null,
          JSON.stringify({
            providerRecordId,
            sourceType: source.sourceType,
            verificationState: normalized.verificationState,
            rawReference: rawReference ?? null,
          }),
        ];
        const evidenceSql = `insert into public.ophanim_evidence(
            organization_id,evidence_type,verification_state,source_id,provider_id,title,
            description,source_url,content_hash,retrieved_at,original_timestamp,
            created_by_user_id,metadata
          ) values($1,'provider_record','source_record',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          on conflict ${
            scopedOrganizationId
              ? "(organization_id,provider_id,content_hash) where organization_id is not null and provider_id is not null and content_hash is not null"
              : "(provider_id,content_hash) where organization_id is null and provider_id is not null and content_hash is not null"
          }
          do update set title=excluded.title,description=excluded.description,
            source_url=excluded.source_url,retrieved_at=excluded.retrieved_at,
            original_timestamp=excluded.original_timestamp,metadata=excluded.metadata
          returning id`;
        const evidence = await client.query<{ id: string }>(
          evidenceSql,
          evidenceValues,
        );
        await client.query(
          `insert into public.ophanim_evidence_links(evidence_id,resource_type,resource_id)
           values($1,'event',$2) on conflict do nothing`,
          [evidence.rows[0].id, eventId],
        );
        evidenceRecords += 1;
      }
    }

    for (const diagnostic of collected.diagnostics) {
      const sourceId =
        intelligenceEventProviderRegistry
          .catalog()
          .find((provider) => provider.id === diagnostic.providerId)
          ?.sourceId ?? null;
      await client.query(
        `insert into public.ophanim_provider_metric_samples(
           provider_id,source_id,requests,successes,failures,timeouts,latency_ms,last_error
         ) values($1,$2,1,$3,$4,$5,$6,$7)`,
        [
          diagnostic.providerId,
          sourceId,
          diagnostic.status === "success" ? 1 : 0,
          diagnostic.status === "error" ? 1 : 0,
          diagnostic.status === "error" &&
          diagnostic.message?.toLowerCase().includes("abort")
            ? 1
            : 0,
          diagnostic.durationMs,
          diagnostic.message ?? null,
        ],
      );
      if (sourceId && diagnostic.status !== "skipped") {
        await client.query(
          `update public.ophanim_sources set
             last_success_at=case when $2='success' then now() else last_success_at end,
             last_failure_at=case when $2='error' then now() else last_failure_at end,
             last_error=case when $2='error' then $3 else null end,
             updated_at=now()
           where id=$1`,
          [sourceId, diagnostic.status, diagnostic.message ?? null],
        );
      }
    }

    await client.query(
      `insert into public.ophanim_job_runs(
         job_key,organization_id,status,started_at,completed_at,duration_ms,metadata
       ) values('intelligence_provider_ingestion',$1,'completed',$3,now(),$4,$2)`,
      [
        actor.organizationId,
        JSON.stringify({
          diagnostics: collected.diagnostics,
          eventCount: insertedOrUpdated,
          evidenceCount: evidenceRecords,
        }),
        new Date(startedAt),
        Date.now() - startedAt,
      ],
    );
    await client.query("commit");
    return {
      eventsProcessed: insertedOrUpdated,
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
