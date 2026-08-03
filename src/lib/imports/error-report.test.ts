import { describe, expect, it } from 'vitest';
import { buildImportErrorReport } from './error-report';
import type { PersistedImport, PersistedImportRow } from './types';

describe('import error reports', () => {
  it('includes only rows that were not imported and protects CSV cells', () => {
    const imported = { id: 'import-1', importType: 'shipment', fileName: 'shipments.csv', fileSizeBytes: 100, fileEncoding: 'utf-8', columnMapping: {}, status: 'completed', totalRows: 2, validRows: 1, invalidRows: 1, duplicateRows: 0, processedRows: 2, importedRows: 1, failedRows: 1, summary: {}, confirmedAt: null, completedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } satisfies PersistedImport;
    const rows: PersistedImportRow[] = [
      { id: 'row-1', rowNumber: 2, rawData: { Carrier: 'MSC' }, normalizedData: null, rowStatus: 'invalid', errors: ['carrier contains a spreadsheet formula.'], importedEntityType: null, importedEntityId: null },
      { id: 'row-2', rowNumber: 3, rawData: { Carrier: 'MSC' }, normalizedData: {}, rowStatus: 'imported', errors: [], importedEntityType: 'shipment', importedEntityId: 'shipment-1' },
    ];
    const report = buildImportErrorReport(imported, rows);
    expect(report).toContain('invalid');
    expect(report).not.toContain('shipment-1');
  });
});
