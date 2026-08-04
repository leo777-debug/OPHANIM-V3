import { createHash } from 'node:crypto';
import { ImportError } from './types';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5_000;

export function decodeUtf8Csv(bytes: ArrayBuffer | Uint8Array): string {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!input.byteLength) throw new ImportError('The CSV file is empty.');
  if (input.byteLength > MAX_IMPORT_BYTES) throw new ImportError('The CSV file exceeds the 5 MB limit.');
  try {
    const csv = new TextDecoder('utf-8', { fatal: true }).decode(input).replace(/^\uFEFF/, '');
    if (csv.includes('\u0000')) throw new ImportError('The CSV file contains unsupported control characters.');
    return csv;
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('CSV files must use UTF-8 encoding.');
  }
}

export function assertCsvText(csv: string): number {
  const bytes = Buffer.byteLength(csv, 'utf8');
  if (!bytes) throw new ImportError('The CSV file is empty.');
  if (bytes > MAX_IMPORT_BYTES) throw new ImportError('The CSV file exceeds the 5 MB limit.');
  return bytes;
}

export function parseCsv(csv: string): string[][] {
  assertCsvText(csv);
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
      continue;
    }
    if (character === '"') {
      if (value) throw new ImportError('CSV contains an invalid quoted field.');
      quoted = true;
    } else if (character === ',') { row.push(value); value = ''; }
    else if (character === '\n') {
      row.push(value.replace(/\r$/, ''));
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = []; value = '';
    } else value += character;
  }

  if (quoted) throw new ImportError('CSV contains an unclosed quoted field.');
  row.push(value.replace(/\r$/, ''));
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  if (rows.length < 2) throw new ImportError('The CSV file must contain a header and at least one data row.');
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw new ImportError('The CSV file exceeds the 5,000-row limit.');
  return rows;
}

export function csvChecksum(csv: string): string { return createHash('sha256').update(csv, 'utf8').digest('hex'); }

export function hasSpreadsheetFormula(value: string): boolean { return /^[=+\-@]/.test(value.trim()); }

export function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '');
  const safe = hasSpreadsheetFormula(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
