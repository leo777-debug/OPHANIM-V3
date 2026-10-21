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

type ShipmentForEntities = {
  id: string; shipmentReference: string; vesselName?: string | null; imoNumber?: string | null; mmsiNumber?: string | null; carrier?: string | null;
  containerNumber?: string | null; billOfLadingReference?: string | null; originPortName?: string | null; originPortCode?: string | null; destinationPortName?: string | null; destinationPortCode?: string | null;
  transshipmentPorts?: unknown[]; customerContact?: string | null;
};
const UNLOCODE = /^[A-Z]{2}[A-Z2-9]{3}$/;
/** Ports (UN/LOCODE), transshipment ports and the customer's email domain, so Deep Watch follows the live route. */
export async function registerRouteEntities(actor: OrganizationActor, shipment: Pick<ShipmentForEntities, 'originPortName' | 'originPortCode' | 'destinationPortName' | 'destinationPortCode' | 'transshipmentPorts' | 'customerContact'>) {
  const ports = [[shipment.originPortName, shipment.originPortCode], [shipment.destinationPortName, shipment.destinationPortCode],
    ...(shipment.transshipmentPorts ?? []).map(port => typeof port === 'string' ? [UNLOCODE.test(port) ? null : port, UNLOCODE.test(port) ? port : null] : [(port as { name?: string })?.name ?? null, (port as { code?: string })?.code ?? null])];
  for (const [name, rawCode] of ports) {
    const code = rawCode?.trim().toUpperCase();
    if (!name && !(code && UNLOCODE.test(code))) continue;
    await registerEntity(actor, { entityType: 'port', canonicalName: name?.trim() || code!, normalizedKey: code && UNLOCODE.test(code) ? code.toLowerCase() : undefined,
      aliases: [...(name ? [{ alias: name.trim() }] : []), ...(code && UNLOCODE.test(code) ? [{ alias: code, identifierType: 'unlocode', identifierValue: code }] : [])] });
  }
  const domain = shipment.customerContact?.match(/@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i)?.[1]?.toLowerCase();
  if (domain && !/^(gmail|yahoo|hotmail|outlook|icloud|live)\./.test(domain)) await registerEntity(actor, { entityType: 'domain', canonicalName: domain, aliases: [{ alias: domain, identifierType: 'domain', identifierValue: domain }] });
}

export async function registerShipmentEntity(actor: OrganizationActor, shipment: ShipmentForEntities): Promise<void> {
  await registerEntity(actor, { entityType: 'shipment', canonicalName: shipment.shipmentReference, normalizedKey: shipment.id, attributes: { shipmentId: shipment.id }, aliases: [
    { alias: shipment.shipmentReference, identifierType: 'shipment_reference', identifierValue: shipment.shipmentReference },
    ...(shipment.containerNumber ? [{ alias: shipment.containerNumber, identifierType: 'container', identifierValue: shipment.containerNumber }] : []),
    ...(shipment.billOfLadingReference ? [{ alias: shipment.billOfLadingReference, identifierType: 'bill_of_lading', identifierValue: shipment.billOfLadingReference }] : []),
  ] });
  await registerRouteEntities(actor, shipment);
  if (shipment.vesselName) await registerEntity(actor, { entityType: 'vessel', canonicalName: shipment.vesselName, aliases: [{ alias: shipment.vesselName }, ...(shipment.imoNumber ? [{ alias: shipment.imoNumber, identifierType: 'imo', identifierValue: shipment.imoNumber }] : []), ...(shipment.mmsiNumber ? [{ alias: shipment.mmsiNumber, identifierType: 'mmsi', identifierValue: shipment.mmsiNumber }] : [])] });
  if (shipment.carrier) await registerEntity(actor, { entityType: 'carrier', canonicalName: shipment.carrier });
}

export async function synchronizeOperationalEntities(actor: OrganizationActor): Promise<{ shipments: number; jobFiles: number; clients: number; assets: number; dependencies: number }> {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write');
  const [shipments, clients, assets, dependencies] = await Promise.all([listShipments(actor), listCyberClients(actor), listCyberAssets(actor), listVendorDependencies(actor)]);
  // Only live shipments: the watchlist follows what is moving now.
  const active = shipments.filter(shipment => !['delivered', 'cancelled', 'archived'].includes(String((shipment as { currentStatus?: string }).currentStatus)));
  for (const shipment of active) await registerShipmentEntity(actor, shipment);
  const jobFiles = await synchronizeJobFileEntities(actor);
  for (const item of clients) await registerEntity(actor, { entityType: 'client', canonicalName: item.name, normalizedKey: item.id, attributes: { clientId: item.id, serviceTier: item.serviceTier }, aliases: [{ alias: item.reference, identifierType: 'client_identifier', identifierValue: item.reference }] });
  for (const item of assets) await registerEntity(actor, { entityType: 'asset', canonicalName: item.assetName, normalizedKey: item.id, attributes: { assetId: item.id, clientId: item.customerId, product: item.product, version: item.productVersion }, aliases: [...(item.hostname ? [{ alias: item.hostname, identifierType: 'hostname', identifierValue: item.hostname }] : []), ...(item.domain ? [{ alias: item.domain, identifierType: 'domain', identifierValue: item.domain }] : []), ...(item.ipAddress ? [{ alias: item.ipAddress, identifierType: 'ip', identifierValue: item.ipAddress }] : [])] });
  for (const item of dependencies) await registerEntity(actor, { entityType: 'vendor_dependency', canonicalName: item.vendor, normalizedKey: item.id, attributes: { dependencyId: item.id, clientId: item.customerId, productOrService: item.productOrService }, aliases: item.productOrService ? [{ alias: `${item.vendor} ${item.productOrService}`, identifierType: 'vendor_product', identifierValue: `${item.vendor} ${item.productOrService}` }] : [] });
  return { shipments: active.length, jobFiles, clients: clients.length, assets: assets.length, dependencies: dependencies.length };
}

/** Open job files: their references (AWB, B/L, container), ports and the client's email domain become watched entities. */
export async function synchronizeJobFileEntities(actor: OrganizationActor): Promise<number> {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write');
  const jobs = (await db().query<{ id: string; job_number: string; origin: string | null; destination: string | null; client_email: string | null }>(
    `select j.id, j.job_number, j.origin, j.destination, c.email as client_email from ophanim_job_files j left join ophanim_counterparties c on c.id = j.client_counterparty_id and c.organization_id = j.organization_id
      where j.organization_id = $1 and j.status not in ('closed', 'cancelled', 'delivered') and not j.is_synthetic order by j.created_at desc limit 500`, [actor.organizationId]).catch(() => ({ rows: [] }))).rows;
  if (!jobs.length) return 0;
  const references = (await db().query<{ job_file_id: string; type: string; normalized_value: string }>(
    `select job_file_id, type, normalized_value from ophanim_job_references where organization_id = $1 and validated and job_file_id = any($2::uuid[]) and type in ('awb', 'hawb', 'bl', 'hbl', 'container', 'booking')`, [actor.organizationId, jobs.map(job => job.id)])).rows;
  for (const job of jobs) {
    await registerEntity(actor, { entityType: 'shipment', canonicalName: job.job_number, normalizedKey: `job:${job.id}`, attributes: { jobFileId: job.id }, aliases: [{ alias: job.job_number, identifierType: 'job_number', identifierValue: job.job_number },
      ...references.filter(reference => reference.job_file_id === job.id).map(reference => ({ alias: reference.normalized_value, identifierType: reference.type, identifierValue: reference.normalized_value }))] });
    const code = (place: string | null) => place && /^[A-Z]{2}[A-Z2-9]{3}$/.test(place.trim().toUpperCase()) ? place.trim().toUpperCase() : null;
    await registerRouteEntities(actor, { originPortName: code(job.origin) ? null : job.origin, originPortCode: code(job.origin), destinationPortName: code(job.destination) ? null : job.destination, destinationPortCode: code(job.destination), transshipmentPorts: [], customerContact: job.client_email });
  }
  return jobs.length;
}
