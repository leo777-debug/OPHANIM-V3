import type { ImportAdapter } from './adapters/types';
import { ImportError, type ImportColumnMapping } from './types';

function normalizedHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

export function suggestColumnMapping<T extends object>(adapter: ImportAdapter<T>, headers: string[]): ImportColumnMapping {
  const available = new Map(headers.map((header) => [normalizedHeader(header), header]));
  return Object.fromEntries(adapter.columns.flatMap((column) => {
    const source = column.aliases.map(normalizedHeader).map((alias) => available.get(alias)).find(Boolean);
    return source ? [[column.key, source]] : [];
  }));
}

export function validateColumnMapping<T extends object>(adapter: ImportAdapter<T>, headers: string[], mapping: ImportColumnMapping): void {
  const available = new Set(headers);
  const fields = new Set(adapter.columns.map((column) => column.key));
  const used = new Set<string>();
  for (const [field, source] of Object.entries(mapping)) {
    if (!fields.has(field) || !source || !available.has(source)) throw new ImportError('CSV column mapping is invalid.');
    if (used.has(source)) throw new ImportError('Each CSV column may be mapped once.');
    used.add(source);
  }
  for (const column of adapter.columns) {
    if (column.required && !mapping[column.key]) throw new ImportError(`Map a column to ${column.label} before importing.`);
  }
}

export function mapRow(raw: Record<string, string>, mapping: ImportColumnMapping): Record<string, unknown> {
  return Object.fromEntries(Object.entries(mapping).map(([field, source]) => [field, source ? raw[source] : undefined]));
}
