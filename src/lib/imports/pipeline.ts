import type { ImportAdapter } from './adapters/types';
import { mapRow, suggestColumnMapping, validateColumnMapping } from './column-mapping';
import { assertCsvText, csvChecksum, hasSpreadsheetFormula, parseCsv } from './csv';
import { ImportError, type ImportColumnMapping, type ImportPreview, type ImportPreviewRow } from './types';

export function previewImportCsv<T extends object>(
  adapter: ImportAdapter<T>,
  csv: string,
  suppliedMapping?: ImportColumnMapping,
): ImportPreview<T> {
  if (!adapter.available) throw new ImportError(adapter.unavailableReason ?? `${adapter.label} imports are not available yet.`);
  const bytes = assertCsvText(csv);
  const parsed = parseCsv(csv);
  const headers = parsed[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new ImportError('CSV headers cannot be empty.');
  if (new Set(headers).size !== headers.length) throw new ImportError('CSV headers must be unique.');

  const suggestedMapping = suggestColumnMapping(adapter, headers);
  const mapping = suppliedMapping ?? suggestedMapping;
  validateColumnMapping(adapter, headers, mapping);
  const knownKeys = new Map<string, number>();

  const rows = parsed.slice(1).map((cells, index): ImportPreviewRow<T> => {
    const raw = Object.fromEntries(headers.map((header, cell) => [header, cells[cell] ?? '']));
    const values = mapRow(raw, mapping);
    const errors = Object.entries(values)
      .filter(([, value]) => typeof value === 'string' && hasSpreadsheetFormula(value))
      .map(([field]) => `${field} contains a spreadsheet formula.`);
    let normalized: T | undefined;
    if (!errors.length) {
      try { normalized = adapter.normalize(values); }
      catch (error) { errors.push(error instanceof Error ? error.message : 'Import row is invalid.'); }
    }
    if (normalized) {
      const key = adapter.duplicateKey(normalized);
      const duplicateOf = knownKeys.get(key);
      if (duplicateOf) errors.push(`${adapter.label} duplicates CSV row ${duplicateOf}.`);
      else knownKeys.set(key, index + 2);
    }
    return { rowNumber: index + 2, raw, normalized, status: errors.length ? (errors.some((error) => error.includes('duplicates CSV row')) ? 'duplicate_in_file' : 'invalid') : 'valid', errors };
  });

  return {
    checksum: csvChecksum(csv), bytes, encoding: 'utf-8', headers, suggestedMapping, mapping, rows,
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === 'valid').length,
    invalidRows: rows.filter((row) => row.status === 'invalid').length,
    duplicateRows: rows.filter((row) => row.status === 'duplicate_in_file').length,
  };
}
