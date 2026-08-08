import { db } from '@/lib/db/pool';
import type { OrganizationActor } from '@/lib/operations/types';
import type { EventInput, PlatformEvent } from './types';
import { key, object, optionalDate, optionalScore, text, uuid } from './validation';

type EventRow = {
  id: string; organization_id: string | null; visibility: PlatformEvent['visibility']; event_type: string; category: string; title: string; description: string | null; event_status: string;
  occurred_at: string | null; first_seen_at: string; updated_at: string; resolved_at: string | null; latitude: number | null; longitude: number | null; geometry: Record<string, unknown> | null; severity: number | null; confidence: number | null; attributes: Record<string, unknown>; metadata: Record<string, unknown>;
};

function record(row: EventRow): PlatformEvent {
  return { id: row.id, organizationId: row.organization_id, visibility: row.visibility, eventType: row.event_type, category: row.category, title: row.title, description: row.description, status: row.event_status, occurredAt: row.occurred_at, firstSeenAt: row.first_seen_at, updatedAt: row.updated_at, resolvedAt: row.resolved_at, latitude: row.latitude, longitude: row.longitude, geometry: row.geometry, severity: row.severity, confidence: row.confidence, attributes: row.attributes ?? {}, metadata: row.metadata ?? {} };
}

export function parseEventInput(value: unknown): EventInput {
  const input = object(value, 'Event');
  const latitude = input.latitude === undefined ? undefined : Number(input.latitude);
  const longitude = input.longitude === undefined ? undefined : Number(input.longitude);
  if ((latitude === undefined) !== (longitude === undefined)) throw new Error('Latitude and longitude must be valid coordinates together.');
  if (latitude !== undefined && longitude !== undefined && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) throw new Error('Latitude and longitude must be valid coordinates together.');
  const status = input.status ?? 'active';
  if (!['active', 'monitoring', 'resolved', 'cancelled', 'unknown'].includes(String(status))) throw new Error('Event status is invalid.');
  const relatedEntityIds = input.relatedEntityIds === undefined ? [] : Array.isArray(input.relatedEntityIds) ? input.relatedEntityIds.map((id) => uuid(id, 'Related entity ID')).slice(0, 100) : (() => { throw new Error('Related entity IDs must be an array.'); })();
  return { eventType: key(input.eventType, 'Event type'), category: key(input.category ?? 'other', 'Event category'), title: text(input.title, 'Event title', 1000)!, description: text(input.description, 'Event description', 10000, false), status: status as EventInput['status'], occurredAt: optionalDate(input.occurredAt, 'Occurred at'), ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}), geometry: object(input.geometry, 'Geometry'), severity: optionalScore(input.severity, 'Severity'), confidence: optionalScore(input.confidence, 'Confidence'), attributes: object(input.attributes, 'Attributes'), metadata: object(input.metadata, 'Metadata'), relatedEntityIds };
}

export async function createEvent(actor: OrganizationActor, value: unknown): Promise<PlatformEvent> {
  const input = parseEventInput(value);
  const client = await db().connect();
  try {
    await client.query('begin');
    const result = await client.query<EventRow>(`insert into ophanim_events(organization_id,visibility,event_type,category,title,description,event_status,occurred_at,latitude,longitude,geometry,severity,confidence,attributes,metadata) values($1,'organization_private',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`, [actor.organizationId, input.eventType, input.category, input.title, input.description ?? null, input.status, input.occurredAt ?? null, input.latitude ?? null, input.longitude ?? null, JSON.stringify(input.geometry ?? {}), input.severity ?? null, input.confidence ?? null, JSON.stringify(input.attributes ?? {}), JSON.stringify(input.metadata ?? {})]);
    const event = result.rows[0];
    for (const entityId of input.relatedEntityIds ?? []) {
      const accessible = await client.query(`select 1 from ophanim_entities where id=$1 and (organization_id=$2 or visibility='global')`, [entityId, actor.organizationId]);
      if (!accessible.rowCount) throw new Error('A related entity is not available to this organization.');
      await client.query(`insert into ophanim_event_entities(event_id,entity_id,relationship_type) values($1,$2,'related_to') on conflict do nothing`, [event.id, entityId]);
    }
    await client.query('commit');
    return record(event);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

export async function getEvent(actor: OrganizationActor, id: string): Promise<PlatformEvent | null> {
  const result = await db().query<EventRow>(`select * from ophanim_events where id=$1 and (organization_id=$2 or visibility='global')`, [id, actor.organizationId]);
  return result.rows[0] ? record(result.rows[0]) : null;
}

export async function listEvents(actor: OrganizationActor, query?: string, limit = 50): Promise<PlatformEvent[]> {
  const bounded = Math.max(1, Math.min(limit, 100));
  const term = query?.trim() || null;
  const result = await db().query<EventRow>(`select * from ophanim_events where (organization_id=$1 or visibility='global') and ($2::text is null or title ilike '%' || $2 || '%' or event_type ilike '%' || lower($2) || '%') order by updated_at desc limit $3`, [actor.organizationId, term, bounded]);
  return result.rows.map(record);
}
