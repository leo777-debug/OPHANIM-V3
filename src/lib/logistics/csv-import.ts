import type { ShipmentInput } from './types';
import { shipmentImportAdapter } from '@/lib/imports/adapters/shipment';
import { suggestColumnMapping, validateColumnMapping } from '@/lib/imports/column-mapping';
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseCsv as parseSharedCsv } from '@/lib/imports/csv';
import { previewImportCsv } from '@/lib/imports/pipeline';
import { ImportError, type ImportPreviewRow } from '@/lib/imports/types';
import { SHIPMENT_IMPORT_FIELDS } from './shipment-import-schema';
import type { ShipmentColumnMapping, ShipmentImportField, ShipmentImportPreview } from './shipment-import-schema';

// Kept as a compatibility façade for the existing logistics workspace and tests.
export const MAX_SHIPMENT_IMPORT_BYTES = MAX_IMPORT_BYTES;
export const MAX_SHIPMENT_IMPORT_ROWS = MAX_IMPORT_ROWS;
export { SHIPMENT_IMPORT_FIELDS };
export type { ShipmentImportField, ShipmentColumnMapping, ShipmentImportPreview } from './shipment-import-schema';
export type ShipmentImportRow = ImportPreviewRow<ShipmentInput>;

export class ShipmentImportError extends ImportError {
  constructor(message: string) { super(message); this.name = 'ShipmentImportError'; }
}

function shipmentFailure<T>(callback: () => T): T {
  try { return callback(); }
  catch (error) { throw new ShipmentImportError(error instanceof Error ? error.message : 'Shipment import failed.'); }
}

export function parseCsv(csv: string): string[][] { return shipmentFailure(() => parseSharedCsv(csv)); }
export function detectShipmentColumnMapping(headers: string[]): ShipmentColumnMapping { return suggestColumnMapping(shipmentImportAdapter, headers); }
export function validateShipmentColumnMapping(headers: string[], mapping: ShipmentColumnMapping): void { shipmentFailure(() => validateColumnMapping(shipmentImportAdapter, headers, mapping)); }
export function previewShipmentCsv(csv: string, suppliedMapping?: ShipmentColumnMapping): ShipmentImportPreview {
  return shipmentFailure(() => previewImportCsv(shipmentImportAdapter, csv, suppliedMapping));
}
