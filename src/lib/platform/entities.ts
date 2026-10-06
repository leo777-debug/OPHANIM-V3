import type { PoolClient } from 'pg';
import { db } from '@/lib/db/pool';
import type { OrganizationActor } from '@/lib/operations/types';
import type { EntityIdentifierInput, EntityInput, PlatformEntity } from './types';
import { key, object, optionalScore, text } from './validation';

type EntityRow = {
  id: string; organization_id: string | null; visibility: PlatformEntity['visibility']; entity_type: string; canonical_name: string; normalized_key: string;
  attributes: Record<string, unknown>; metadata: Record<string, unknown>; confidence: number | null; first_seen_at: string | null; last_seen_at: string | null; last_verified_at: string | null; created_at: string; updated_at: string;
};

function normalized(value: string): string { return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9.:-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function record(row: EntityRow): PlatformEntity {
  return { id: row.id, organizationId: row.organization_id, visibility: row.visibility, entityType: row.entity_type, canonicalName: row.canonical_name, normalizedKey: row.normalized_key, attributes: row.attributes ?? {}, metadata: row.metadata ?? {}, confidence: row.confidence, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, lastVerifiedAt: row.last_verified_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

function identifiers(value: unknown): EntityIdentifierInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30) throw new Error('Identifiers must contain at most 30 entries.');
  return value.map((item) => {
    const input = object(item, 'Identifier');
    return { namespace: key(input.namespace, 'Identifier namespace'), value: text(input.value, 'Identifier value', 1000)!, ...(input.sourceId ? { sourceId: key(input.sourceId, 'Identifier source') } : {}), ...(input.confidence !== undefined ? { confidence: optionalScore(input.confidence, 'Identifier confidence') } : {}), metadata: object(input.metadata, 'Identifier metadata') };
  });
}

export function parseEntityInput(value: unknown): EntityInput {
  const input = object(value, 'Entity');
  const aliases = input.aliases === undefined ? [] : Array.isArray(input.aliases) ? input.aliases.map((alias) => text(alias, 'Alias', 500)!).slice(0, 30) : (() => { throw new Error('Aliases must be an array.'); })();
  return { entityType: key(input.entityType, 'Entity type', 80), canonicalName: text(input.canonicalName, 'Canonical name', 500)!, aliases, identifiers: identifiers(input.identifiers), attributes: object(input.attributes, 'Attributes'), metadata: object(input.metadata, 'Metadata'), ...(input.confidence !== undefined ? { confidence: optionalScore(input.confidence, 'Confidence') } : {}) };
}

async function addIdentifiers(client: PoolClient, entityId: string, values: EntityIdentifierInput[]) {
  for (const identifier of values) {
    await client.query(`insert into ophanim_entity_identifiers(entity_id,namespace,identifier_value,normalized_value,source_id,confidence,metadata) values($1,$2,$3,$4,$5,$6,$7) on conflict(entity_id,namespace,normalized_value) do update set identifier_value=excluded.identifier_value,confidence=excluded.confidence,metadata=excluded.metadata,last_seen_at=now()`, [entityId, identifier.namespace, identifier.value, normalized(identifier.value), identifier.sourceId ?? null, identifier.confidence ?? null, JSON.stringify(identifier.metadata ?? {})]);
  }
}

export async function createEntity(actor: OrganizationActor, value: unknown): Promise<PlatformEntity> {
  const input = parseEntityInput(value);
  const client = await db().connect();
  try {
    await client.query('begin');
    const result = await client.query<EntityRow>(`insert into ophanim_entities(organization_id,visibility,entity_type,canonical_name,normalized_key,attributes,metadata,confidence,first_seen_at,last_seen_at) values($1,'organization_private',$2,$3,$4,$5,$6,$7,now(),now()) on conflict(organization_id,entity_type,normalized_key) do update set attributes=excluded.attributes,metadata=excluded.metadata,confidence=excluded.confidence,last_seen_at=now(),updated_at=now() returning *`, [actor.organizationId, input.entityType, input.canonicalName, normalized(input.canonicalName), JSON.stringify(input.attributes ?? {}), JSON.stringify(input.metadata ?? {}), input.confidence ?? null]);
    const entity = result.rows[0];
    for (const alias of input.aliases ?? []) await client.query(`insert into ophanim_entity_aliases(entity_id,alias,normalized_alias) values($1,$2,$3) on conflict(entity_id,normalized_alias) do nothing`, [entity.id, alias, normalized(alias)]);
    await addIdentifiers(client, entity.id, input.identifiers ?? []);
    await client.query('commit');
    return getEntity(actor, entity.id) as Promise<PlatformEntity>;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

export async function getEntity(actor: OrganizationActor, id: string): Promise<PlatformEntity | null> {
  const result = await db().query<EntityRow>(`select * from ophanim_entities where id=$1 and (organization_id=$2 or visibility='global')`, [id, actor.organizationId]);
  const row = result.rows[0];
  if (!row) return null;
  const [aliases, identifiersResult] = await Promise.all([
    db().query<{ alias: string }>('select alias from ophanim_entity_aliases where entity_id=$1 order by alias', [id]),
    db().query<{ namespace: string; identifier_value: string; source_id: string | null; confidence: number | null; metadata: Record<string, unknown> }>('select namespace,identifier_value,source_id,confidence,metadata from ophanim_entity_identifiers where entity_id=$1 order by namespace,identifier_value', [id]),
  ]);
  return { ...record(row), aliases: aliases.rows.map((item) => item.alias), identifiers: identifiersResult.rows.map((item) => ({ namespace: item.namespace, value: item.identifier_value, ...(item.source_id ? { sourceId: item.source_id } : {}), ...(item.confidence !== null ? { confidence: item.confidence } : {}), metadata: item.metadata ?? {} })) };
}

export async function listEntities(actor: OrganizationActor, query?: string, limit = 50): Promise<PlatformEntity[]> {
  const bounded = Math.max(1, Math.min(limit, 100));
  const term = query?.trim();
  const result = await db().query<EntityRow>(`select * from ophanim_entities where (organization_id=$1 or visibility='global') and ($2::text is null or canonical_name ilike '%' || $2 || '%' or normalized_key ilike '%' || lower($2) || '%') order by updated_at desc limit $3`, [actor.organizationId, term || null, bounded]);
  return result.rows.map(record);
}
