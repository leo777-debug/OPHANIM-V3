import { db } from '@/lib/db/pool';
import type { OrganizationActor } from '@/lib/operations/types';

type Signal = { type: 'exact_identifier_match' | 'canonical_name_match' | 'time_overlap'; reason: string; score: number };

function folded(value: string): string { return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9.:-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function contains(text: string, candidate: string): boolean {
  const value = folded(candidate);
  if (value.length < 3) return false;
  if (value.includes('.') || value.includes(':') || /^\d+$/.test(value)) return folded(text).includes(value);
  return new RegExp(`(^|[^a-z0-9])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}($|[^a-z0-9])`, 'i').test(folded(text));
}

export async function correlateEvent(actor: OrganizationActor, eventId: string) {
  const eventResult = await db().query<{ id: string; title: string; description: string | null; occurred_at: string | null }>(`select id,title,description,occurred_at from ophanim_events where id=$1 and organization_id=$2`, [eventId, actor.organizationId]);
  const event = eventResult.rows[0];
  if (!event) throw new Error('Event not found.');
  const text = `${event.title}\n${event.description ?? ''}`;
  const entities = await db().query<{ id: string; canonical_name: string }>(`select id,canonical_name from ophanim_entities where organization_id=$1 or visibility='global' order by updated_at desc limit 500`, [actor.organizationId]);
  const identifiers = await db().query<{ entity_id: string; namespace: string; identifier_value: string }>(`select identifier.entity_id,identifier.namespace,identifier.identifier_value from ophanim_entity_identifiers identifier join ophanim_entities entity on entity.id=identifier.entity_id where entity.organization_id=$1 or entity.visibility='global'`, [actor.organizationId]);
  const byEntity = new Map<string, Signal[]>();
  for (const entity of entities.rows) {
    if (contains(text, entity.canonical_name)) byEntity.set(entity.id, [{ type: 'canonical_name_match', reason: `Canonical name "${entity.canonical_name}" appears in the event text.`, score: 65 }]);
  }
  for (const identifier of identifiers.rows) {
    if (!contains(text, identifier.identifier_value)) continue;
    const signals = byEntity.get(identifier.entity_id) ?? [];
    signals.push({ type: 'exact_identifier_match', reason: `${identifier.namespace} identifier "${identifier.identifier_value}" matches the event text.`, score: 100 });
    byEntity.set(identifier.entity_id, signals);
  }
  const saved = [];
  for (const [entityId, signals] of byEntity) {
    const confidence = Math.min(100, Math.max(...signals.map((signal) => signal.score)));
    const explanation = signals.map((signal) => signal.reason).join(' ');
    const result = await db().query<{ id: string }>(`insert into ophanim_correlations(organization_id,event_id,entity_id,relationship_type,confidence,signals,explanation) values($1,$2,$3,'likely_related',$4,$5,$6) on conflict(event_id,entity_id,relationship_type) do update set confidence=excluded.confidence,signals=excluded.signals,explanation=excluded.explanation,updated_at=now() returning id`, [actor.organizationId, eventId, entityId, confidence, JSON.stringify(signals), explanation]);
    saved.push({ id: result.rows[0].id, entityId, confidence, signals, explanation });
  }
  return saved.sort((left, right) => right.confidence - left.confidence);
}

export async function listEventCorrelations(actor: OrganizationActor, eventId: string) {
  const result = await db().query(`select correlation.*,entity.canonical_name,entity.entity_type from ophanim_correlations correlation join ophanim_entities entity on entity.id=correlation.entity_id join ophanim_events event on event.id=correlation.event_id where correlation.event_id=$1 and event.organization_id=$2 order by correlation.confidence desc`, [eventId, actor.organizationId]);
  return result.rows;
}
