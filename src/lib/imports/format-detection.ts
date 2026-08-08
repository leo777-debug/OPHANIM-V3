import { createHash } from 'node:crypto';
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from './csv';
import { ImportError } from './types';

export type Delimiter = ',' | ';' | '\t' | '|';

export interface DecodedDelimitedFile {
  text: string;
  encoding: 'utf-8' | 'windows-1252';
  delimiter: Delimiter;
  rows: string[][];
  checksum: string;
}

function decode(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''), encoding: 'windows-1252' };
  }
}

export function detectDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/).filter(Boolean).slice(0, 10).join('\n');
  const candidates: Delimiter[] = [',', ';', '\t', '|'];
  return candidates.map((delimiter) => ({ delimiter, count: sample.split(delimiter).length - 1 })).sort((left, right) => right.count - left.count)[0]?.delimiter ?? ',';
}

export function parseDelimited(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
      continue;
    }
    if (character === '"') {
      if (value) throw new ImportError('Delimited file contains an invalid quoted field.');
      quoted = true;
    } else if (character === delimiter) { row.push(value); value = ''; }
    else if (character === '\n') { row.push(value.replace(/\r$/, '')); if (row.some((cell) => cell.length > 0)) rows.push(row); row = []; value = ''; }
    else value += character;
  }
  if (quoted) throw new ImportError('Delimited file contains an unclosed quoted field.');
  row.push(value.replace(/\r$/, ''));
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  if (rows.length < 2) throw new ImportError('The file must contain a header and at least one data row.');
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw new ImportError('The file exceeds the 5,000-row limit.');
  return rows;
}

export function decodeDelimitedFile(value: ArrayBuffer | Uint8Array): DecodedDelimitedFile {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (!bytes.byteLength) throw new ImportError('The file is empty.');
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new ImportError('The file exceeds the 5 MB limit.');
  const decoded = decode(bytes);
  if (decoded.text.includes('\u0000')) throw new ImportError('The file contains unsupported control characters.');
  const delimiter = detectDelimiter(decoded.text);
  return { ...decoded, delimiter, rows: parseDelimited(decoded.text, delimiter), checksum: createHash('sha256').update(bytes).digest('hex') };
}
