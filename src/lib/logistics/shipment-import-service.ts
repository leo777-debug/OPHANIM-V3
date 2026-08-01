import type { PoolClient } from 'pg';
import { db } from '@/lib/watchlists/db';
import type { OrganizationActor } from '@/lib/operations/types';
import type { ShipmentImportPreview } from './csv-import';
import type { ShipmentInput } from './types';

export interface ExistingShipmentReference {
  shipmentReference: string;
}

export interface ShipmentImportConfirmation {
  acceptedRows: number;
  duplicateExistingRows: number;
  rejectedRows: number;
}

export interface PersistedShipmentImport {
  id: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
}

interface StoredImportRow {
  id: string;
  normalized_data: ShipmentInput | null;
  row_status: 'valid' | 'invalid' | 'duplicate_in_file' | 'duplicate_existing' | 'imported';
}

function requireImportActor(actor: OrganizationActor): void {
  if (!actor.organizationId || !actor.userId) throw new Error('An authenticated organization actor is required.');
}

export function assessShipmentImportConfirmation(
  actor: OrganizationActor,
  preview: ShipmentImportPreview,
  existingShipments: ExistingShipmentReference[],
): ShipmentImportConfirmation {
  requireImportActor(actor);
  const existingReferences = new Set(existingShipments.map((shipment) => shipment.shipmentReference.trim().toLowerCase()));
  let acceptedRows = 0;
  let duplicateExistingRows = 0;
  let rejectedRows = 0;

  for (const row of preview.rows) {
    if (row.status !== 'valid' || !row.normalized) {
      rejectedRows += 1;
    } else if (existingReferences.has(row.normalized.shipmentReference.toLowerCase())) {
      duplicateExistingRows += 1;
    } else {
      acceptedRows += 1;
    }
  }

  return { acceptedRows, duplicateExistingRows, rejectedRows };
}

export async function persistShipmentImportPreview(
  actor: OrganizationActor,
  fileName: string,
  preview: ShipmentImportPreview,
): Promise<PersistedShipmentImport> {
  requireImportActor(actor);
  const client = await db().connect();
  try {
    await client.query('begin');
    const imported = await client.query<PersistedShipmentImport>(
      `insert into ophanim_shipment_imports (
        organization_id, created_by_user_id, file_name, file_size_bytes, file_sha256, column_mapping,
        total_rows, valid_rows, invalid_rows, duplicate_rows
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      returning id, total_rows as "totalRows", valid_rows as "validRows", invalid_rows as "invalidRows", duplicate_rows as "duplicateRows"`,
      [
        actor.organizationId, actor.userId, fileName.trim(), preview.bytes, preview.checksum, JSON.stringify(preview.mapping),
        preview.totalRows, preview.validRows, preview.invalidRows, preview.duplicateRows,
      ],
    );
    const shipmentImport = imported.rows[0];
    for (const row of preview.rows) {
      await client.query(
        `insert into ophanim_shipment_import_rows (shipment_import_id, row_number, raw_data, normalized_data, row_status, errors)
        values ($1, $2, $3, $4, $5, $6)`,
        [shipmentImport.id, row.rowNumber, JSON.stringify(row.raw), row.normalized ? JSON.stringify(row.normalized) : null, row.status, JSON.stringify(row.errors)],
      );
    }
    await client.query(
      `insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata)
      values ($1, $2, 'shipment_import.preview_created', 'shipment_import', $3, $4)`,
      [actor.organizationId, actor.userId, shipmentImport.id, JSON.stringify({ totalRows: preview.totalRows, checksum: preview.checksum })],
    );
    await client.query('commit');
    return shipmentImport;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

function shipmentValues(organizationId: string, userId: string, shipment: ShipmentInput): unknown[] {
  return [
    organizationId, shipment.shipmentReference, shipment.bookingNumber ?? null, shipment.containerNumber ?? null,
    shipment.billOfLadingReference ?? null, shipment.carrier ?? null, shipment.vesselName ?? null, shipment.imoNumber ?? null,
    shipment.originPortName ?? null, shipment.originPortCode ?? null, shipment.destinationPortName ?? null,
    shipment.destinationPortCode ?? null, shipment.operationalTimezone ?? 'UTC', shipment.plannedDepartureAt ?? null,
    shipment.plannedArrivalAt ?? null, shipment.actualDepartureAt ?? null, shipment.actualArrivalAt ?? null,
    shipment.cargoType ?? null, shipment.priority ?? 3, shipment.currentStatus ?? 'planned', userId, userId,
  ];
}

export async function confirmShipmentImport(actor: OrganizationActor, shipmentImportId: string): Promise<ShipmentImportConfirmation> {
  requireImportActor(actor);
  const client = await db().connect();
  try {
    await client.query('begin');
    const imported = await client.query<{ id: string }>(
      `select id from ophanim_shipment_imports
       where id = $1 and organization_id = $2 and status = 'previewed' for update`,
      [shipmentImportId, actor.organizationId],
    );
    if (!imported.rowCount) throw new Error('Shipment import was not found or is no longer available for confirmation.');

    const rows = await client.query<StoredImportRow>(
      `select id, normalized_data, row_status from ophanim_shipment_import_rows
       where shipment_import_id = $1 order by row_number for update`,
      [shipmentImportId],
    );
    const references = rows.rows.flatMap((row) => row.normalized_data?.shipmentReference ? [row.normalized_data.shipmentReference.toLowerCase()] : []);
    const existing = references.length
      ? await client.query<{ shipment_reference: string }>(
        `select shipment_reference from ophanim_shipments
         where organization_id = $1 and lower(shipment_reference) = any($2::text[]) and archived_at is null`,
        [actor.organizationId, references],
      )
      : { rows: [] };
    const existingReferences = new Set(existing.rows.map((shipment) => shipment.shipment_reference.toLowerCase()));

    let acceptedRows = 0;
    let duplicateExistingRows = 0;
    let rejectedRows = 0;
    for (const row of rows.rows) {
      if (row.row_status !== 'valid' || !row.normalized_data) {
        rejectedRows += 1;
        continue;
      }
      if (existingReferences.has(row.normalized_data.shipmentReference.toLowerCase())) {
        duplicateExistingRows += 1;
        await client.query(
          `update ophanim_shipment_import_rows
           set row_status = 'duplicate_existing', errors = errors || $2::jsonb where id = $1`,
          [row.id, JSON.stringify(['Shipment reference already exists in this organization.'])],
        );
        continue;
      }

      const shipment = await insertShipment(client, actor, row.normalized_data);
      existingReferences.add(row.normalized_data.shipmentReference.toLowerCase());
      acceptedRows += 1;
      await client.query(
        `update ophanim_shipment_import_rows set row_status = 'imported', imported_shipment_id = $2 where id = $1`,
        [row.id, shipment.id],
      );
    }
    await client.query(`update ophanim_shipment_imports set status = 'confirmed', confirmed_at = now(), updated_at = now() where id = $1`, [shipmentImportId]);
    await client.query(
      `insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata)
       values ($1, $2, 'shipment_import.confirmed', 'shipment_import', $3, $4)`,
      [actor.organizationId, actor.userId, shipmentImportId, JSON.stringify({ acceptedRows, duplicateExistingRows, rejectedRows })],
    );
    await client.query('commit');
    return { acceptedRows, duplicateExistingRows, rejectedRows };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function insertShipment(client: PoolClient, actor: OrganizationActor, shipment: ShipmentInput): Promise<{ id: string }> {
  const created = await client.query<{ id: string }>(
    `insert into ophanim_shipments (
      organization_id, shipment_reference, booking_number, container_number, bill_of_lading_reference, carrier,
      vessel_name, imo_number, origin_port_name, origin_port_code, destination_port_name, destination_port_code,
      operational_timezone, planned_departure_at, planned_arrival_at, actual_departure_at, actual_arrival_at,
      cargo_type, priority, current_status, owner_user_id, created_by_user_id
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
    returning id`,
    shipmentValues(actor.organizationId, actor.userId, shipment),
  );
  return created.rows[0];
}
