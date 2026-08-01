import { db } from '@/lib/watchlists/db';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';
import type { ShipmentInput, ShipmentStatus } from './types';
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
  shipment_reference: string;
  booking_number: string | null;
  container_number: string | null;
  bill_of_lading_reference: string | null;
  carrier: string | null;
  vessel_name: string | null;
  imo_number: string | null;
  origin_port_name: string | null;
  origin_port_code: string | null;
  destination_port_name: string | null;
  destination_port_code: string | null;
  operational_timezone: string;
  planned_departure_at: string | null;
  planned_arrival_at: string | null;
  actual_departure_at: string | null;
  actual_arrival_at: string | null;
  cargo_type: string | null;
  priority: number;
  current_status: ShipmentStatus;
  created_at: string;
  updated_at: string;
}

const fields = `
  id, organization_id, shipment_reference, booking_number, container_number, bill_of_lading_reference, carrier,
  vessel_name, imo_number, origin_port_name, origin_port_code, destination_port_name, destination_port_code,
  operational_timezone, planned_departure_at, planned_arrival_at, actual_departure_at, actual_arrival_at,
  cargo_type, priority, current_status, created_at, updated_at
`;

function nullable(value: string | null): string | undefined {
  return value ?? undefined;
}

function toRecord(row: ShipmentRow): ShipmentRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    shipmentReference: row.shipment_reference,
    bookingNumber: nullable(row.booking_number),
    containerNumber: nullable(row.container_number),
    billOfLadingReference: nullable(row.bill_of_lading_reference),
    carrier: nullable(row.carrier),
    vesselName: nullable(row.vessel_name),
    imoNumber: nullable(row.imo_number),
    originPortName: nullable(row.origin_port_name),
    originPortCode: nullable(row.origin_port_code),
    destinationPortName: nullable(row.destination_port_name),
    destinationPortCode: nullable(row.destination_port_code),
    operationalTimezone: row.operational_timezone,
    plannedDepartureAt: nullable(row.planned_departure_at),
    plannedArrivalAt: nullable(row.planned_arrival_at),
    actualDepartureAt: nullable(row.actual_departure_at),
    actualArrivalAt: nullable(row.actual_arrival_at),
    cargoType: nullable(row.cargo_type),
    priority: row.priority,
    currentStatus: row.current_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function values(actor: OrganizationActor, shipment: ShipmentInput): unknown[] {
  return [
    actor.organizationId, shipment.shipmentReference, shipment.bookingNumber ?? null, shipment.containerNumber ?? null,
    shipment.billOfLadingReference ?? null, shipment.carrier ?? null, shipment.vesselName ?? null, shipment.imoNumber ?? null,
    shipment.originPortName ?? null, shipment.originPortCode ?? null, shipment.destinationPortName ?? null,
    shipment.destinationPortCode ?? null, shipment.operationalTimezone ?? 'UTC', shipment.plannedDepartureAt ?? null,
    shipment.plannedArrivalAt ?? null, shipment.actualDepartureAt ?? null, shipment.actualArrivalAt ?? null,
    shipment.cargoType ?? null, shipment.priority ?? 3, shipment.currentStatus ?? 'planned', actor.userId, actor.userId,
  ];
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
  const client = await db().connect();
  try {
    await client.query('begin');
    const created = await client.query<ShipmentRow>(
      `insert into ophanim_shipments (
        organization_id, shipment_reference, booking_number, container_number, bill_of_lading_reference, carrier,
        vessel_name, imo_number, origin_port_name, origin_port_code, destination_port_name, destination_port_code,
        operational_timezone, planned_departure_at, planned_arrival_at, actual_departure_at, actual_arrival_at,
        cargo_type, priority, current_status, owner_user_id, created_by_user_id
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      returning ${fields}`,
      values(actor, shipment),
    );
    const record = toRecord(created.rows[0]);
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
  const client = await db().connect();
  try {
    await client.query('begin');
    const updated = await client.query<ShipmentRow>(
      `update ophanim_shipments set
        shipment_reference = $3, booking_number = $4, container_number = $5, bill_of_lading_reference = $6,
        carrier = $7, vessel_name = $8, imo_number = $9, origin_port_name = $10, origin_port_code = $11,
        destination_port_name = $12, destination_port_code = $13, operational_timezone = $14,
        planned_departure_at = $15, planned_arrival_at = $16, actual_departure_at = $17, actual_arrival_at = $18,
        cargo_type = $19, priority = $20, current_status = $21, updated_at = now()
       where id = $1 and organization_id = $2 and archived_at is null returning ${fields}`,
      [shipmentId, actor.organizationId, ...values(actor, shipment).slice(1, 20)],
    );
    if (!updated.rowCount) {
      await client.query('rollback');
      return null;
    }
    const record = toRecord(updated.rows[0]);
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
