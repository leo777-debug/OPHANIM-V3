import { createHash } from 'node:crypto';
import type { ShipmentInput } from './types';
import { ShipmentValidationError, validateShipmentInput } from './shipment-validation';

export const MAX_SHIPMENT_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_SHIPMENT_IMPORT_ROWS = 5_000;

export const SHIPMENT_IMPORT_FIELDS = [
  'shipmentReference', 'bookingNumber', 'containerNumber', 'billOfLadingReference', 'carrier', 'vesselName', 'imoNumber',
  'originPortName', 'originPortCode', 'destinationPortName', 'destinationPortCode', 'operationalTimezone',
  'plannedDepartureAt', 'plannedArrivalAt', 'actualDepartureAt', 'actualArrivalAt', 'cargoType', 'priority', 'currentStatus',
] as const;

export type ShipmentImportField = (typeof SHIPMENT_IMPORT_FIELDS)[number];
export type ShipmentColumnMapping = Partial<Record<ShipmentImportField, string>>;

export interface ShipmentImportRow {
  rowNumber: number;
  raw: Record<string, string>;
  normalized?: ShipmentInput;
  status: 'valid' | 'invalid' | 'duplicate_in_file';
  errors: string[];
}

export interface ShipmentImportPreview {
  checksum: string;
  bytes: number;
  headers: string[];
  suggestedMapping: ShipmentColumnMapping;
  mapping: ShipmentColumnMapping;
  rows: ShipmentImportRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
}

const aliases: Record<ShipmentImportField, string[]> = {
  shipmentReference: ['shipment reference', 'internal shipment reference', 'shipment ref', 'reference'],
  bookingNumber: ['booking number', 'booking'],
  containerNumber: ['container number', 'container'],
  billOfLadingReference: ['bill of lading reference', 'bill of lading', 'bol', 'bl number'],
  carrier: ['carrier', 'shipping line'],
  vesselName: ['vessel name', 'vessel', 'ship name', 'ship'],
  imoNumber: ['imo number', 'imo'],
  originPortName: ['origin port', 'origin port name'],
  originPortCode: ['origin port code', 'origin unlocode'],
  destinationPortName: ['destination port', 'destination port name'],
  destinationPortCode: ['destination port code', 'destination unlocode'],
  operationalTimezone: ['operational timezone', 'timezone', 'time zone'],
  plannedDepartureAt: ['planned departure', 'etd', 'estimated departure'],
  plannedArrivalAt: ['planned arrival', 'eta', 'estimated arrival'],
  actualDepartureAt: ['actual departure', 'atd'],
  actualArrivalAt: ['actual arrival', 'ata'],
  cargoType: ['cargo type', 'cargo'],
  priority: ['priority', 'shipment priority'],
  currentStatus: ['current status', 'status'],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function assertImportSize(csv: string): number {
  const bytes = Buffer.byteLength(csv, 'utf8');
  if (!bytes) throw new ShipmentImportError('The CSV file is empty.');
  if (bytes > MAX_SHIPMENT_IMPORT_BYTES) throw new ShipmentImportError('The CSV file exceeds the 5 MB limit.');
  return bytes;
}

export class ShipmentImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShipmentImportError';
  }
}

export function parseCsv(csv: string): string[][] {
  assertImportSize(csv);
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      if (value) throw new ShipmentImportError('CSV contains an invalid quoted field.');
      quoted = true;
    } else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''));
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  if (quoted) throw new ShipmentImportError('CSV contains an unclosed quoted field.');
  row.push(value.replace(/\r$/, ''));
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  if (rows.length < 2) throw new ShipmentImportError('The CSV file must contain a header and at least one data row.');
  if (rows.length - 1 > MAX_SHIPMENT_IMPORT_ROWS) throw new ShipmentImportError('The CSV file exceeds the 5,000-row limit.');
  return rows;
}

export function detectShipmentColumnMapping(headers: string[]): ShipmentColumnMapping {
  const normalizedHeaders = new Map(headers.map((header) => [normalizeHeader(header), header]));
  return Object.fromEntries(SHIPMENT_IMPORT_FIELDS.flatMap((field) => {
    const source = aliases[field].map((alias) => normalizedHeaders.get(alias)).find(Boolean);
    return source ? [[field, source]] : [];
  })) as ShipmentColumnMapping;
}

export function validateShipmentColumnMapping(headers: string[], mapping: ShipmentColumnMapping): void {
  const available = new Set(headers);
  const used = new Set<string>();
  for (const [field, source] of Object.entries(mapping)) {
    if (!SHIPMENT_IMPORT_FIELDS.includes(field as ShipmentImportField) || !source || !available.has(source)) {
      throw new ShipmentImportError('CSV column mapping is invalid.');
    }
    if (used.has(source)) throw new ShipmentImportError('Each CSV column may be mapped once.');
    used.add(source);
  }
  if (!mapping.shipmentReference) throw new ShipmentImportError('Map a column to Shipment reference before importing.');
}

function hasFormula(value: string): boolean {
  return /^[=+\-@]/.test(value.trim());
}

function rowObject(headers: string[], cells: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
}

function mapRow(raw: Record<string, string>, mapping: ShipmentColumnMapping): Record<string, unknown> {
  return Object.fromEntries(Object.entries(mapping).map(([field, source]) => [field, source ? raw[source] : undefined]));
}

export function previewShipmentCsv(csv: string, suppliedMapping?: ShipmentColumnMapping): ShipmentImportPreview {
  const bytes = assertImportSize(csv);
  const parsed = parseCsv(csv);
  const headers = parsed[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new ShipmentImportError('CSV headers cannot be empty.');
  if (new Set(headers).size !== headers.length) throw new ShipmentImportError('CSV headers must be unique.');

  const suggestedMapping = detectShipmentColumnMapping(headers);
  const mapping = suppliedMapping ?? suggestedMapping;
  validateShipmentColumnMapping(headers, mapping);
  const references = new Map<string, number>();

  const rows = parsed.slice(1).map((cells, index): ShipmentImportRow => {
    const raw = rowObject(headers, cells);
    const values = mapRow(raw, mapping);
    const errors: string[] = [];
    for (const [field, value] of Object.entries(values)) {
      if (typeof value === 'string' && hasFormula(value)) errors.push(`${field} contains a spreadsheet formula.`);
    }

    let normalized: ShipmentInput | undefined;
    if (!errors.length) {
      try {
        normalized = validateShipmentInput(values);
      } catch (error) {
        errors.push(error instanceof ShipmentValidationError ? error.message : 'Shipment row is invalid.');
      }
    }

    if (normalized) {
      const duplicateOf = references.get(normalized.shipmentReference.toLowerCase());
      if (duplicateOf) errors.push(`Shipment reference duplicates CSV row ${duplicateOf}.`);
      else references.set(normalized.shipmentReference.toLowerCase(), index + 2);
    }

    return {
      rowNumber: index + 2,
      raw,
      normalized,
      status: errors.length ? (errors.some((error) => error.includes('duplicates CSV row')) ? 'duplicate_in_file' : 'invalid') : 'valid',
      errors,
    };
  });

  return {
    checksum: createHash('sha256').update(csv, 'utf8').digest('hex'),
    bytes,
    headers,
    suggestedMapping,
    mapping,
    rows,
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === 'valid').length,
    invalidRows: rows.filter((row) => row.status === 'invalid').length,
    duplicateRows: rows.filter((row) => row.status === 'duplicate_in_file').length,
  };
}
