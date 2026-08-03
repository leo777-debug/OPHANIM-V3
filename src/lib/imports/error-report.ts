import { escapeCsvCell } from './csv';
import type { PersistedImport, PersistedImportRow } from './types';

export function buildImportErrorReport(importRecord: PersistedImport, rows: PersistedImportRow[]): string {
  const header = ['Import type', 'Row', 'Status', 'Errors', 'Raw data'];
  const failingRows = rows.filter((row) => !['valid', 'imported'].includes(row.rowStatus));
  const lines = failingRows.map((row) => [
    importRecord.importType,
    row.rowNumber,
    row.rowStatus,
    row.errors.join(' | '),
    JSON.stringify(row.rawData),
  ].map(escapeCsvCell).join(','));
  return [header.map(escapeCsvCell).join(','), ...lines].join('\r\n');
}
