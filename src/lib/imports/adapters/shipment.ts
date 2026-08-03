import { createShipment } from '@/lib/logistics/shipments';
import { validateShipmentInput } from '@/lib/logistics/shipment-validation';
import type { ShipmentInput } from '@/lib/logistics/types';
import { db } from '@/lib/watchlists/db';
import type { ImportAdapter } from './types';

export const shipmentImportAdapter: ImportAdapter<ShipmentInput> = {
  type: 'shipment',
  label: 'Shipment reference',
  description: 'Shipment records for the active organization.',
  available: true,
  columns: [
    { key: 'shipmentReference', label: 'Shipment reference', required: true, aliases: ['shipment reference', 'internal shipment reference', 'shipment ref', 'reference'] },
    { key: 'bookingNumber', label: 'Booking number', aliases: ['booking number', 'booking'] },
    { key: 'containerNumber', label: 'Container number', aliases: ['container number', 'container'] },
    { key: 'billOfLadingReference', label: 'Bill of lading reference', aliases: ['bill of lading reference', 'bill of lading', 'bol', 'bl number'] },
    { key: 'carrier', label: 'Carrier', aliases: ['carrier', 'shipping line'] },
    { key: 'vesselName', label: 'Vessel name', aliases: ['vessel name', 'vessel', 'ship name', 'ship'] },
    { key: 'imoNumber', label: 'IMO number', aliases: ['imo number', 'imo'] },
    { key: 'originPortName', label: 'Origin port', aliases: ['origin port', 'origin port name'] },
    { key: 'originPortCode', label: 'Origin port code', aliases: ['origin port code', 'origin unlocode'] },
    { key: 'destinationPortName', label: 'Destination port', aliases: ['destination port', 'destination port name'] },
    { key: 'destinationPortCode', label: 'Destination port code', aliases: ['destination port code', 'destination unlocode'] },
    { key: 'operationalTimezone', label: 'Operational timezone', aliases: ['operational timezone', 'timezone', 'time zone'] },
    { key: 'plannedDepartureAt', label: 'Planned departure', aliases: ['planned departure', 'etd', 'estimated departure'] },
    { key: 'plannedArrivalAt', label: 'Planned arrival', aliases: ['planned arrival', 'eta', 'estimated arrival'] },
    { key: 'actualDepartureAt', label: 'Actual departure', aliases: ['actual departure', 'atd'] },
    { key: 'actualArrivalAt', label: 'Actual arrival', aliases: ['actual arrival', 'ata'] },
    { key: 'cargoType', label: 'Cargo type', aliases: ['cargo type', 'cargo'] },
    { key: 'priority', label: 'Priority', aliases: ['priority', 'shipment priority'] },
    { key: 'currentStatus', label: 'Current status', aliases: ['current status', 'status'] },
  ],
  normalize: validateShipmentInput,
  duplicateKey: (shipment) => shipment.shipmentReference.trim().toLowerCase(),
  async findExisting(actor, shipments) {
    const references = shipments.map((shipment) => shipment.shipmentReference.trim().toLowerCase());
    if (!references.length) return new Set<string>();
    const result = await db().query<{ shipment_reference: string }>(
      `select shipment_reference from ophanim_shipments
       where organization_id = $1 and lower(shipment_reference) = any($2::text[]) and archived_at is null`,
      [actor.organizationId, references],
    );
    return new Set(result.rows.map((row) => row.shipment_reference.trim().toLowerCase()));
  },
  async persist(actor, shipment) {
    const created = await createShipment(actor, shipment);
    return { entityType: 'shipment', entityId: created.id };
  },
};
