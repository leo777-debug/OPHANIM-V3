import { db } from '@/lib/watchlists/db';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';
import { listCyberAssets, listCyberClients, listVendorDependencies } from '@/lib/cyber/inventory';
import { listShipments } from '@/lib/logistics/shipments';
import type { RegisteredEntity } from './types';

type StoredEntityType = RegisteredEntity['entityType'];
interface EntityRow { id: string; entity_type: StoredEntityType; canonical_name: string; normalized_key: string; attributes: Record<string, unknown>; last_verified_at: string | null; }
interface AliasRow { entity_id: string; alias: string; identifier_type: string | null; identifier_value: string | null; }
export interface EntityRegistration { entityType: StoredEntityType; canonicalName: string; normalizedKey?: string; attributes?: Record<string, unknown>; lastVerifiedAt?: string; aliases?: Array<{ alias: string; identifierType?: string; identifierValue?: string }>; }

function normalize(value: string): string { return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9.:-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function clean(value: unknown, field: string, max = 500): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`); const result = value.trim().replace(/\s+/g, ' '); if (result.length > max) throw new Error(`${field} is too long.`); return result; }
function entityFrom(row: EntityRow, aliases: AliasRow[]): RegisteredEntity { return { id: row.id, entityType: row.entity_type, canonicalName: row.canonical_name, normalizedKey: row.normalized_key, attributes: row.attributes ?? {}, lastVerifiedAt: row.last_verified_at ?? undefined, aliases: aliases.filter((alias) => alias.entity_id === row.id).map((alias) => ({ alias: alias.alias, identifierType: alias.identifier_type ?? undefined, identifierValue: alias.identifier_value ?? undefined })) }; }

export async function registerEntity(actor: OrganizationActor, input: EntityRegistration): Promise<RegisteredEntity> {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write');
  const canonicalName = clean(input.canonicalName, 'Entity name'); const normalizedKey = normalize(input.normalizedKey ?? canonicalName); if (!normalizedKey) throw new Error('Entity key is invalid.');
  const client = await db().connect();
  try {
    await client.query('begin');
    const result = await client.query<EntityRow>(`insert into ophanim_entities(organization_id,entity_type,canonical_name,normalized_key,attributes,last_verified_at) values($1,$2,$3,$4,$5,$6) on conflict(organization_id,entity_type,normalized_key) do update set canonical_name=excluded.canonical_name,attributes=ophanim_entities.attributes || excluded.attributes,last_verified_at=coalesce(excluded.last_verified_at,ophanim_entities.last_verified_at),updated_at=now() returning id,entity_type,canonical_name,normalized_key,attributes,last_verified_at`, [actor.organizationId,input.entityType,canonicalName,normalizedKey,JSON.stringify(input.attributes ?? {}),input.lastVerifiedAt ?? null]);
    const entity = result.rows[0];
    for (const item of input.aliases ?? []) { const alias = clean(item.alias, 'Entity alias'); await client.query(`insert into ophanim_entity_aliases(entity_id,alias,normalized_alias,identifier_type,identifier_value,last_verified_at) values($1,$2,$3,$4,$5,$6) on conflict(entity_id,normalized_alias) do update set identifier_type=coalesce(excluded.identifier_type,ophanim_entity_aliases.identifier_type),identifier_value=coalesce(excluded.identifier_value,ophanim_entity_aliases.identifier_value),last_verified_at=coalesce(excluded.last_verified_at,ophanim_entity_aliases.last_verified_at)`, [entity.id,alias,normalize(alias),item.identifierType ?? null,item.identifierValue ?? null,input.lastVerifiedAt ?? null]); }
    await client.query(`insert into ophanim_audit_events(organization_id,actor_user_id,action,subject_type,subject_id,metadata) values($1,$2,'entity.registered','entity',$3,$4)`, [actor.organizationId,actor.userId,entity.id,JSON.stringify({ entityType: input.entityType, normalizedKey })]);
    await client.query('commit');
    const registered = (await findRegisteredEntities(actor, entity.id))[0];
    if (!registered) throw new Error('Registered entity could not be read.');
    return registered;
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
}

export async function findRegisteredEntities(actor: OrganizationActor, id?: string): Promise<RegisteredEntity[]> {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:read');
  const entities = await db().query<EntityRow>(`select id,entity_type,canonical_name,normalized_key,attributes,last_verified_at from ophanim_entities where organization_id=$1${id ? ' and id=$2' : ''} order by canonical_name`, id ? [actor.organizationId,id] : [actor.organizationId]);
  if (!entities.rowCount) return [];
  const aliases = await db().query<AliasRow>('select entity_id,alias,identifier_type,identifier_value from ophanim_entity_aliases where entity_id=any($1::uuid[]) order by alias', [entities.rows.map((entity) => entity.id)]);
  return entities.rows.map((entity) => entityFrom(entity, aliases.rows));
}

export async function registerShipmentEntity(actor: OrganizationActor, shipment: { id: string; shipmentReference: string; vesselName?: string; imoNumber?: string; mmsiNumber?: string; carrier?: string }): Promise<void> {
  await registerEntity(actor, { entityType: 'shipment', canonicalName: shipment.shipmentReference, normalizedKey: shipment.id, attributes: { shipmentId: shipment.id }, aliases: [{ alias: shipment.shipmentReference, identifierType: 'shipment_reference', identifierValue: shipment.shipmentReference }] });
  if (shipment.vesselName) await registerEntity(actor, { entityType: 'vessel', canonicalName: shipment.vesselName, aliases: [{ alias: shipment.vesselName }, ...(shipment.imoNumber ? [{ alias: shipment.imoNumber, identifierType: 'imo', identifierValue: shipment.imoNumber }] : []), ...(shipment.mmsiNumber ? [{ alias: shipment.mmsiNumber, identifierType: 'mmsi', identifierValue: shipment.mmsiNumber }] : [])] });
  if (shipment.carrier) await registerEntity(actor, { entityType: 'carrier', canonicalName: shipment.carrier });
}

export async function synchronizeOperationalEntities(actor: OrganizationActor): Promise<{ shipments: number; clients: number; assets: number; dependencies: number }> {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write');
  const [shipments, clients, assets, dependencies] = await Promise.all([listShipments(actor), listCyberClients(actor), listCyberAssets(actor), listVendorDependencies(actor)]);
  for (const shipment of shipments) await registerShipmentEntity(actor, shipment);
  for (const item of clients) await registerEntity(actor, { entityType: 'client', canonicalName: item.name, normalizedKey: item.id, attributes: { clientId: item.id, serviceTier: item.serviceTier }, aliases: [{ alias: item.reference, identifierType: 'client_identifier', identifierValue: item.reference }] });
  for (const item of assets) await registerEntity(actor, { entityType: 'asset', canonicalName: item.assetName, normalizedKey: item.id, attributes: { assetId: item.id, clientId: item.customerId, product: item.product, version: item.productVersion }, aliases: [...(item.hostname ? [{ alias: item.hostname, identifierType: 'hostname', identifierValue: item.hostname }] : []), ...(item.domain ? [{ alias: item.domain, identifierType: 'domain', identifierValue: item.domain }] : []), ...(item.ipAddress ? [{ alias: item.ipAddress, identifierType: 'ip', identifierValue: item.ipAddress }] : [])] });
  for (const item of dependencies) await registerEntity(actor, { entityType: 'vendor_dependency', canonicalName: item.vendor, normalizedKey: item.id, attributes: { dependencyId: item.id, clientId: item.customerId, productOrService: item.productOrService }, aliases: item.productOrService ? [{ alias: `${item.vendor} ${item.productOrService}`, identifierType: 'vendor_product', identifierValue: `${item.vendor} ${item.productOrService}` }] : [] });
  return { shipments: shipments.length, clients: clients.length, assets: assets.length, dependencies: dependencies.length };
}
