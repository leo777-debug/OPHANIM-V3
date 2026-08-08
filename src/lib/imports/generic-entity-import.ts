import { db } from '@/lib/db/pool';
import type { OrganizationActor } from '@/lib/operations/types';
import { createEntity, parseEntityInput } from '@/lib/platform/entities';
import { key, object, text } from '@/lib/platform/validation';
import type { EntityInput } from '@/lib/platform/types';
import { hasSpreadsheetFormula } from './csv';
import { decodeDelimitedFile } from './format-detection';

export interface EntityImportMapping {
  canonicalName: string;
  aliases?: string[];
  identifiers?: Array<{ namespace: string; column: string }>;
  attributes?: Record<string, string>;
  metadata?: Record<string, string>;
}

export interface EntityImportPreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  normalized?: EntityInput;
  status: 'valid' | 'invalid' | 'duplicate_in_file';
  errors: string[];
}

export interface EntityImportPreview {
  entityType: string;
  encoding: string;
  delimiter: string;
  headers: string[];
  checksum: string;
  bytes: number;
  rows: EntityImportPreviewRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
}

function parseMapping(value: unknown): EntityImportMapping {
  const input = object(value, 'Import mapping');
  const canonicalName = text(input.canonicalName, 'Canonical-name column', 500)!;
  const aliases = input.aliases === undefined ? [] : Array.isArray(input.aliases) ? input.aliases.map((column) => text(column, 'Alias column', 500)!).slice(0, 30) : (() => { throw new Error('Alias columns must be an array.'); })();
  const identifiers = input.identifiers === undefined ? [] : Array.isArray(input.identifiers) ? input.identifiers.map((item) => {
    const mapping = object(item, 'Identifier mapping');
    return { namespace: key(mapping.namespace, 'Identifier namespace'), column: text(mapping.column, 'Identifier column', 500)! };
  }).slice(0, 30) : (() => { throw new Error('Identifier mappings must be an array.'); })();
  const mapping = (name: string) => Object.fromEntries(Object.entries(object(input[name], `${name} mapping`)).map(([field, column]) => [key(field, `${name} field`), text(column, `${name} column`, 500)!]));
  return { canonicalName, aliases, identifiers, attributes: mapping('attributes'), metadata: mapping('metadata') };
}

function mappedValues(raw: Record<string, string>, entityType: string, mapping: EntityImportMapping): EntityInput {
  const get = (column: string) => raw[column] ?? '';
  const values = Object.values(raw);
  if (values.some(hasSpreadsheetFormula)) throw new Error('Row contains a spreadsheet formula.');
  return parseEntityInput({
    entityType,
    canonicalName: get(mapping.canonicalName),
    aliases: mapping.aliases?.map(get).filter(Boolean),
    identifiers: mapping.identifiers?.map((identifier) => ({ namespace: identifier.namespace, value: get(identifier.column) })).filter((identifier) => identifier.value),
    attributes: Object.fromEntries(Object.entries(mapping.attributes ?? {}).map(([field, column]) => [field, get(column)]).filter(([, value]) => value)),
    metadata: Object.fromEntries(Object.entries(mapping.metadata ?? {}).map(([field, column]) => [field, get(column)]).filter(([, value]) => value)),
  });
}

export function previewEntityImport(bytes: ArrayBuffer | Uint8Array, entityTypeValue: unknown, mappingValue: unknown): EntityImportPreview {
  const entityType = key(entityTypeValue, 'Entity type', 80);
  const mapping = parseMapping(mappingValue);
  const decoded = decodeDelimitedFile(bytes);
  const headers = decoded.rows[0].map((header) => header.trim());
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) throw new Error('Import headers must be populated and unique.');
  const needed = [mapping.canonicalName, ...(mapping.aliases ?? []), ...(mapping.identifiers ?? []).map((identifier) => identifier.column), ...Object.values(mapping.attributes ?? {}), ...Object.values(mapping.metadata ?? {})];
  if (needed.some((column) => !headers.includes(column))) throw new Error('A mapped column is missing from the file.');
  const seen = new Map<string, number>();
  const rows = decoded.rows.slice(1).map((cells, index): EntityImportPreviewRow => {
    const raw = Object.fromEntries(headers.map((header, cell) => [header, cells[cell] ?? '']));
    const errors: string[] = [];
    let normalized: EntityInput | undefined;
    try { normalized = mappedValues(raw, entityType, mapping); } catch (error) { errors.push(error instanceof Error ? error.message : 'Row is invalid.'); }
    if (normalized) {
      const duplicate = seen.get(`${normalized.entityType}:${normalized.canonicalName.toLowerCase()}`);
      if (duplicate) errors.push(`Entity duplicates row ${duplicate}.`);
      else seen.set(`${normalized.entityType}:${normalized.canonicalName.toLowerCase()}`, index + 2);
    }
    return { rowNumber: index + 2, raw, normalized, status: errors.length ? (errors.some((error) => error.includes('duplicates row')) ? 'duplicate_in_file' : 'invalid') : 'valid', errors };
  });
  return { entityType, encoding: decoded.encoding, delimiter: decoded.delimiter, headers, checksum: decoded.checksum, bytes: bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength, rows, totalRows: rows.length, validRows: rows.filter((row) => row.status === 'valid').length, invalidRows: rows.filter((row) => row.status === 'invalid').length, duplicateRows: rows.filter((row) => row.status === 'duplicate_in_file').length };
}

export async function createEntityImport(actor: OrganizationActor, fileName: string, bytes: Uint8Array, entityType: unknown, mapping: unknown) {
  const preview = previewEntityImport(bytes, entityType, mapping);
  const result = await db().query<{ id: string }>(`insert into ophanim_entity_imports(organization_id,created_by_user_id,entity_type,file_name,file_size_bytes,file_sha256,file_encoding,delimiter,field_mapping,total_rows,valid_rows,invalid_rows,duplicate_rows) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`, [actor.organizationId, actor.userId, preview.entityType, fileName.trim(), preview.bytes, preview.checksum, preview.encoding, preview.delimiter, JSON.stringify(mapping), preview.totalRows, preview.validRows, preview.invalidRows, preview.duplicateRows]);
  const importId = result.rows[0].id;
  for (const row of preview.rows) await db().query(`insert into ophanim_entity_import_rows(import_id,row_number,raw_data,normalized_data,row_status,errors) values($1,$2,$3,$4,$5,$6)`, [importId, row.rowNumber, JSON.stringify(row.raw), row.normalized ? JSON.stringify(row.normalized) : null, row.status, JSON.stringify(row.errors)]);
  return { id: importId, preview };
}

export async function confirmEntityImport(actor: OrganizationActor, importId: string) {
  const result = await db().query(`update ophanim_entity_imports set status='queued',confirmed_at=now(),updated_at=now() where id=$1 and organization_id=$2 and status='previewed' returning *`, [importId, actor.organizationId]);
  if (!result.rowCount) throw new Error('Import is not available for confirmation.');
  return result.rows[0];
}

export async function processEntityImports(limit = 2) {
  const candidates = await db().query<{ id: string; organization_id: string; created_by_user_id: string }>(`select id,organization_id,created_by_user_id from ophanim_entity_imports where status='queued' order by confirmed_at for update skip locked limit $1`, [Math.max(1, Math.min(limit, 10))]);
  let processed = 0;
  for (const candidate of candidates.rows) {
    const claimed = await db().query(`update ophanim_entity_imports set status='running',updated_at=now() where id=$1 and status='queued' returning id`, [candidate.id]);
    if (!claimed.rowCount) continue;
    const rows = await db().query<{ id: string; normalized_data: EntityInput | null }>(`select id,normalized_data from ophanim_entity_import_rows where import_id=$1 and row_status='valid' order by row_number`, [candidate.id]);
    let imported = 0;
    let failed = 0;
    for (const row of rows.rows) {
      try {
        const entity = await createEntity({ organizationId: candidate.organization_id, userId: candidate.created_by_user_id, role: 'owner' }, row.normalized_data);
        await db().query(`update ophanim_entity_import_rows set row_status='imported',entity_id=$2 where id=$1`, [row.id, entity.id]);
        imported += 1;
      } catch (error) {
        await db().query(`update ophanim_entity_import_rows set row_status='failed',errors=$2 where id=$1`, [row.id, JSON.stringify([error instanceof Error ? error.message : 'Import failed.'])]);
        failed += 1;
      }
    }
    await db().query(`update ophanim_entity_imports set status='completed',imported_rows=$2,failed_rows=$3,completed_at=now(),updated_at=now(),summary=$4 where id=$1`, [candidate.id, imported, failed, JSON.stringify({ imported, failed })]);
    processed += 1;
  }
  return processed;
}
