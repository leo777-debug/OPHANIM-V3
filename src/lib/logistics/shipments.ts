import { db } from '@/lib/watchlists/db';
import type { PoolClient } from 'pg';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';
import type { ShipmentInput, ShipmentMilestoneInput, ShipmentStatus } from './types';
import { validateShipmentInput } from './shipment-validation';

export interface ShipmentRecord extends ShipmentInput {
  id: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

interface ShipmentRow {
  id: string;
  organization_id: string;
  customer_id: string | null;
  shipment_reference: string;
  booking_number: string | null;
  container_number: string | null;
  bill_of_lading_reference: string | null;
  carrier: string | null;
  vessel_name: string | null;
  imo_number: string | null;
  mmsi_number: string | null;
  origin_port_name: string | null;
  origin_port_code: string | null;
  destination_port_name: string | null;
  destination_port_code: string | null;
  transshipment_ports: string[];
  customer_contact: string | null;
  operational_timezone: string;
  planned_departure_at: string | null;
  planned_arrival_at: string | null;
  actual_departure_at: string | null;
  actual_arrival_at: string | null;
  cargo_type: string | null;
  priority: number;
  current_status: ShipmentStatus;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
}

const fields = `
  id, organization_id, customer_id, shipment_reference, booking_number, container_number, bill_of_lading_reference, carrier,
  vessel_name, imo_number, mmsi_number, origin_port_name, origin_port_code, destination_port_name, destination_port_code, transshipment_ports, customer_contact,
  operational_timezone, planned_departure_at, planned_arrival_at, actual_departure_at, actual_arrival_at,
  cargo_type, priority, current_status, owner_user_id, created_at, updated_at
`;

function nullable(value: string | null): string | undefined {
  return value ?? undefined;
}

function toRecord(row: ShipmentRow): ShipmentRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    customerId: nullable(row.customer_id),
    shipmentReference: row.shipment_reference,
    bookingNumber: nullable(row.booking_number),
    containerNumber: nullable(row.container_number),
    billOfLadingReference: nullable(row.bill_of_lading_reference),
    carrier: nullable(row.carrier),
    vesselName: nullable(row.vessel_name),
    imoNumber: nullable(row.imo_number),
    mmsiNumber: nullable(row.mmsi_number),
    originPortName: nullable(row.origin_port_name),
    originPortCode: nullable(row.origin_port_code),
    destinationPortName: nullable(row.destination_port_name),
    destinationPortCode: nullable(row.destination_port_code),
    transshipmentPorts: row.transshipment_ports ?? [],
    customerContact: nullable(row.customer_contact),
    operationalTimezone: row.operational_timezone,
    plannedDepartureAt: nullable(row.planned_departure_at),
    plannedArrivalAt: nullable(row.planned_arrival_at),
    actualDepartureAt: nullable(row.actual_departure_at),
    actualArrivalAt: nullable(row.actual_arrival_at),
    cargoType: nullable(row.cargo_type),
    priority: row.priority,
    currentStatus: row.current_status,
    ownerUserId: nullable(row.owner_user_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function values(actor: OrganizationActor, shipment: ShipmentInput): unknown[] {
  return [
    actor.organizationId, shipment.customerId ?? null, shipment.shipmentReference, shipment.bookingNumber ?? null, shipment.containerNumber ?? null,
    shipment.billOfLadingReference ?? null, shipment.carrier ?? null, shipment.vesselName ?? null, shipment.imoNumber ?? null,
    shipment.mmsiNumber ?? null, shipment.originPortName ?? null, shipment.originPortCode ?? null, shipment.destinationPortName ?? null,
    shipment.destinationPortCode ?? null, JSON.stringify(shipment.transshipmentPorts ?? []), shipment.customerContact ?? null, shipment.operationalTimezone ?? 'UTC', shipment.plannedDepartureAt ?? null,
    shipment.plannedArrivalAt ?? null, shipment.actualDepartureAt ?? null, shipment.actualArrivalAt ?? null,
    shipment.cargoType ?? null, shipment.priority ?? 3, shipment.currentStatus ?? 'planned', shipment.ownerUserId ?? actor.userId, actor.userId,
  ];
}

async function assertShipmentReferences(actor: OrganizationActor, shipment: ShipmentInput): Promise<void> {
  if (shipment.customerId) {
    const customer = await db().query('select 1 from ophanim_customers where id = $1 and organization_id = $2 and status = \'active\'', [shipment.customerId, actor.organizationId]);
    if (!customer.rowCount) throw new Error('Customer was not found in this organization.');
  }
  if (shipment.ownerUserId) {
    const owner = await db().query('select 1 from ophanim_organization_memberships where organization_id = $1 and user_id = $2', [actor.organizationId, shipment.ownerUserId]);
    if (!owner.rowCount) throw new Error('Shipment owner must belong to this organization.');
  }
}

async function replaceMilestones(client: PoolClient, shipmentId: string, milestones: ShipmentMilestoneInput[]): Promise<void> {
  await client.query('delete from ophanim_shipment_milestones where shipment_id = $1 and source_type in (\'manual\', \'import\')', [shipmentId]);
  for (const milestone of milestones) {
    await client.query(
      `insert into ophanim_shipment_milestones (shipment_id, milestone_type, deadline_at, source_type)
       values ($1, $2, $3, 'manual')`,
      [shipmentId, milestone.milestoneType, milestone.deadlineAt],
    );
  }
}

export async function listShipments(actor: OrganizationActor): Promise<ShipmentRecord[]> {
  requireOrganizationAccess(actor, actor.organizationId, 'shipment:read');
  const result = await db().query<ShipmentRow>(
    `select ${fields} from ophanim_shipments where organization_id = $1 and archived_at is null
     order by planned_arrival_at nulls last, created_at desc`,
    [actor.organizationId],
  );
  return result.rows.map(toRecord);
}

export async function getShipment(actor: OrganizationActor, shipmentId: string): Promise<ShipmentRecord | null> {
  requireOrganizationAccess(actor, actor.organizationId, 'shipment:read');
  const result = await db().query<ShipmentRow>(
    `select ${fields} from ophanim_shipments where id = $1 and organization_id = $2 and archived_at is null`,
    [shipmentId, actor.organizationId],
  );
  return result.rows[0] ? toRecord(result.rows[0]) : null;
}

export async function createShipment(actor: OrganizationActor, input: unknown): Promise<ShipmentRecord> {
  requireOrganizationAccess(actor, actor.organizationId, 'shipment:write');
  const shipment = validateShipmentInput(input);
  await assertShipmentReferences(actor, shipment);
  const client = await db().connect();
  try {
    await client.query('begin');
    const created = await client.query<ShipmentRow>(
      `insert into ophanim_shipments (
        organization_id, customer_id, shipment_reference, booking_number, container_number, bill_of_lading_reference, carrier,
        vessel_name, imo_number, mmsi_number, origin_port_name, origin_port_code, destination_port_name, destination_port_code, transshipment_ports, customer_contact,
        operational_timezone, planned_departure_at, planned_arrival_at, actual_departure_at, actual_arrival_at,
        cargo_type, priority, current_status, owner_user_id, created_by_user_id
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      returning ${fields}`,
      values(actor, shipment),
    );
    const record = toRecord(created.rows[0]);
    if (shipment.milestones) await replaceMilestones(client, record.id, shipment.milestones);
    await client.query(
      `insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata)
       values ($1, $2, 'shipment.created', 'shipment', $3, $4)`,
      [actor.organizationId, actor.userId, record.id, JSON.stringify({ shipmentReference: record.shipmentReference })],
    );
    await client.query('commit');
    return record;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateShipment(actor: OrganizationActor, shipmentId: string, patch: unknown): Promise<ShipmentRecord | null> {
  requireOrganizationAccess(actor, actor.organizationId, 'shipment:write');
  const existing = await getShipment(actor, shipmentId);
  if (!existing) return null;
  const shipment = validateShipmentInput({ ...existing, ...(patch as Record<string, unknown>) });
  await assertShipmentReferences(actor, shipment);
  const client = await db().connect();
  try {
    await client.query('begin');
    const updated = await client.query<ShipmentRow>(
      `update ophanim_shipments set
        customer_id = $3, shipment_reference = $4, booking_number = $5, container_number = $6, bill_of_lading_reference = $7,
        carrier = $8, vessel_name = $9, imo_number = $10, mmsi_number = $11, origin_port_name = $12, origin_port_code = $13,
        destination_port_name = $14, destination_port_code = $15, transshipment_ports = $16, customer_contact = $17, operational_timezone = $18,
        planned_departure_at = $19, planned_arrival_at = $20, actual_departure_at = $21, actual_arrival_at = $22,
        cargo_type = $23, priority = $24, current_status = $25, owner_user_id = $26, updated_at = now()
       where id = $1 and organization_id = $2 and archived_at is null returning ${fields}`,
      [shipmentId, actor.organizationId, ...values(actor, shipment).slice(1, 25)],
    );
    if (!updated.rowCount) {
      await client.query('rollback');
      return null;
    }
    const record = toRecord(updated.rows[0]);
    if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'milestones')) await replaceMilestones(client, record.id, shipment.milestones ?? []);
    await client.query(
      `insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata)
       values ($1, $2, 'shipment.updated', 'shipment', $3, $4)`,
      [actor.organizationId, actor.userId, record.id, JSON.stringify({ shipmentReference: record.shipmentReference })],
    );
    await client.query('commit');
    return record;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveShipment(actor: OrganizationActor, shipmentId: string): Promise<boolean> {
  requireOrganizationAccess(actor, actor.organizationId, 'shipment:archive');
  const archived = await db().query(
    `update ophanim_shipments set archived_at = now(), current_status = 'archived', updated_at = now()
     where id = $1 and organization_id = $2 and archived_at is null returning id`,
    [shipmentId, actor.organizationId],
  );
  if (!archived.rowCount) return false;
  await db().query(
    `insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id)
     values ($1, $2, 'shipment.archived', 'shipment', $3)`,
    [actor.organizationId, actor.userId, shipmentId],
  );
  return true;
}
