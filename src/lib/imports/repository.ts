import { db } from '@/lib/watchlists/db';
import type { OrganizationActor } from '@/lib/operations/types';
import type { ImportPreview, ImportStatus, ImportType, PersistedImport, PersistedImportRow } from './types';

interface ImportDbRow {
  id: string; import_type: ImportType; file_name: string; file_size_bytes: number; file_encoding: string; column_mapping: Record<string, string | undefined>;
  status: ImportStatus; total_rows: number; valid_rows: number; invalid_rows: number; duplicate_rows: number; processed_rows: number; imported_rows: number; failed_rows: number;
  summary: Record<string, unknown>; confirmed_at: Date | null; completed_at: Date | null; created_at: Date; updated_at: Date;
}

interface ImportRowDbRow {
  id: string; row_number: number; raw_data: Record<string, string>; normalized_data: Record<string, unknown> | null;
  row_status: PersistedImportRow['rowStatus']; errors: string[]; imported_entity_type: string | null; imported_entity_id: string | null;
}

function toImport(row: ImportDbRow): PersistedImport {
  return {
    id: row.id, importType: row.import_type, fileName: row.file_name, fileSizeBytes: row.file_size_bytes, fileEncoding: row.file_encoding,
    columnMapping: row.column_mapping, status: row.status, totalRows: row.total_rows, validRows: row.valid_rows, invalidRows: row.invalid_rows,
    duplicateRows: row.duplicate_rows, processedRows: row.processed_rows, importedRows: row.imported_rows, failedRows: row.failed_rows,
    summary: row.summary ?? {}, confirmedAt: row.confirmed_at?.toISOString() ?? null, completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

function toImportRow(row: ImportRowDbRow): PersistedImportRow {
  return {
    id: row.id, rowNumber: row.row_number, rawData: row.raw_data, normalizedData: row.normalized_data, rowStatus: row.row_status,
    errors: row.errors ?? [], importedEntityType: row.imported_entity_type, importedEntityId: row.imported_entity_id,
  };
}

export async function persistImportPreview<T extends object>(
  actor: OrganizationActor,
  importType: ImportType,
  fileName: string,
  preview: ImportPreview<T>,
): Promise<PersistedImport> {
  const client = await db().connect();
  try {
    await client.query('begin');
    const inserted = await client.query<ImportDbRow>(
      `insert into ophanim_imports (
        organization_id, created_by_user_id, import_type, file_name, file_size_bytes, file_sha256, file_encoding, column_mapping,
        total_rows, valid_rows, invalid_rows, duplicate_rows
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
      [actor.organizationId, actor.userId, importType, fileName.trim(), preview.bytes, preview.checksum, preview.encoding, JSON.stringify(preview.mapping), preview.totalRows, preview.validRows, preview.invalidRows, preview.duplicateRows],
    );
    const imported = inserted.rows[0];
    for (const row of preview.rows) {
      await client.query(
        `insert into ophanim_import_rows (import_id, row_number, raw_data, normalized_data, row_status, errors)
         values ($1, $2, $3, $4, $5, $6)`,
        [imported.id, row.rowNumber, JSON.stringify(row.raw), row.normalized ? JSON.stringify(row.normalized) : null, row.status, JSON.stringify(row.errors)],
      );
    }
    await client.query(
      `insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata)
       values ($1, $2, 'import.preview_created', 'import', $3, $4)`,
      [actor.organizationId, actor.userId, imported.id, JSON.stringify({ importType, totalRows: preview.totalRows, checksum: preview.checksum })],
    );
    await client.query('commit');
    return toImport(imported);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

export async function getImport(actor: OrganizationActor, importId: string): Promise<PersistedImport | null> {
  const result = await db().query<ImportDbRow>(`select * from ophanim_imports where id = $1 and organization_id = $2`, [importId, actor.organizationId]);
  return result.rows[0] ? toImport(result.rows[0]) : null;
}

export async function getImportRows(actor: OrganizationActor, importId: string): Promise<PersistedImportRow[]> {
  const result = await db().query<ImportRowDbRow>(
    `select rows.* from ophanim_import_rows rows join ophanim_imports imports on imports.id = rows.import_id
     where rows.import_id = $1 and imports.organization_id = $2 order by rows.row_number`,
    [importId, actor.organizationId],
  );
  return result.rows.map(toImportRow);
}

export async function listImports(actor: OrganizationActor, limit = 25): Promise<PersistedImport[]> {
  const result = await db().query<ImportDbRow>(
    `select * from ophanim_imports where organization_id = $1 order by created_at desc limit $2`,
    [actor.organizationId, Math.min(Math.max(limit, 1), 100)],
  );
  return result.rows.map(toImport);
}

export async function updateImportStatus(importId: string, status: ImportStatus, summary: Record<string, unknown> = {}): Promise<void> {
  await db().query(
    `update ophanim_imports set status = $2, summary = summary || $3::jsonb,
       completed_at = case when $2 in ('completed', 'failed', 'cancelled') then now() else completed_at end,
       updated_at = now() where id = $1`,
    [importId, status, JSON.stringify(summary)],
  );
}

export async function appendImportAudit(actor: OrganizationActor, importId: string, action: string, metadata: Record<string, unknown>): Promise<void> {
  await db().query(
    `insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata)
     values ($1, $2, $3, 'import', $4, $5)`,
    [actor.organizationId, actor.userId, action, importId, JSON.stringify(metadata)],
  );
}
