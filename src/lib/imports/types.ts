export const IMPORT_TYPES = ['shipment', 'cyber_client', 'cyber_asset', 'vendor_dependency'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export const IMPORT_STATUSES = ['previewed', 'queued', 'running', 'completed', 'failed', 'cancelled'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const IMPORT_ROW_STATUSES = ['valid', 'invalid', 'duplicate_in_file', 'duplicate_existing', 'imported', 'failed'] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export interface ImportColumnDefinition {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
}

export type ImportColumnMapping = Record<string, string | undefined>;

export interface ImportPreviewRow<T = Record<string, unknown>> {
  rowNumber: number;
  raw: Record<string, string>;
  normalized?: T;
  status: 'valid' | 'invalid' | 'duplicate_in_file';
  errors: string[];
}

export interface ImportPreview<T = Record<string, unknown>> {
  checksum: string;
  bytes: number;
  encoding: 'utf-8';
  headers: string[];
  suggestedMapping: ImportColumnMapping;
  mapping: ImportColumnMapping;
  rows: ImportPreviewRow<T>[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
}

export interface PersistedImport {
  id: string;
  importType: ImportType;
  fileName: string;
  fileSizeBytes: number;
  fileEncoding: string;
  columnMapping: ImportColumnMapping;
  status: ImportStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  processedRows: number;
  importedRows: number;
  failedRows: number;
  summary: Record<string, unknown>;
  confirmedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedImportRow {
  id: string;
  rowNumber: number;
  rawData: Record<string, string>;
  normalizedData: Record<string, unknown> | null;
  rowStatus: ImportRowStatus;
  errors: string[];
  importedEntityType: string | null;
  importedEntityId: string | null;
}

export interface ImportPreviewResponse {
  import: PersistedImport;
  preview: ImportPreview;
  adapter: { type: ImportType; label: string; available: boolean; unavailableReason?: string };
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}
