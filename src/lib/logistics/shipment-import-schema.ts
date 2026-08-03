import type { ImportColumnMapping, ImportPreview } from '@/lib/imports/types';
import type { ShipmentInput } from './types';

export const SHIPMENT_IMPORT_FIELDS = [
  'shipmentReference', 'bookingNumber', 'containerNumber', 'billOfLadingReference',
  'carrier', 'vesselName', 'imoNumber', 'originPortName', 'originPortCode',
  'destinationPortName', 'destinationPortCode', 'operationalTimezone',
  'plannedDepartureAt', 'plannedArrivalAt', 'actualDepartureAt', 'actualArrivalAt',
  'cargoType', 'priority', 'currentStatus',
] as const;

export type ShipmentImportField = (typeof SHIPMENT_IMPORT_FIELDS)[number];
export type ShipmentColumnMapping = ImportColumnMapping;
export type ShipmentImportPreview = ImportPreview<ShipmentInput>;

