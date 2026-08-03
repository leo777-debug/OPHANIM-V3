import type { QueryResultRow } from 'pg';
import { db } from '@/lib/watchlists/db';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';
import { assertImportFeature } from './access';
import { getImportAdapter } from './adapters/types';
import { ImportError, type ImportStatus, type ImportType, type PersistedImport } from './types';

export const IMPORT_BACKGROUND_ROW_THRESHOLD = 250;
const IMPORT_JOB_BATCH_SIZE = 250;
const IMPORT_JOB_MAX_ATTEMPTS = 3;

interface ImportProcessRow extends QueryResultRow {
  id: string;
  normalized_data: Record<string, unknown> | null;
}

interface ImportJobRow extends QueryResultRow {
  id: string;
  import_id: string;
  attempts: number;
  created_by_user_id: string | null;
  organization_id: string;
  import_type: ImportType;
}

export interface ImportConfirmation {
  import: PersistedImport;
  mode: 'synchronous' | 'queued';
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unable to import this row.';
  return message.slice(0, 500);
}

async function readImport(actor: OrganizationActor, importId: string, status?: ImportStatus): Promise<PersistedImport> {
  const result = await db().query<{
    id: string; import_type: ImportType; file_name: string; file_size_bytes: number; file_encoding: string; column_mapping: Record<string, string | undefined>;
    status: ImportStatus; total_rows: number; valid_rows: number; invalid_rows: number; duplicate_rows: number; processed_rows: number; imported_rows: number; failed_rows: number;
    summary: Record<string, unknown>; confirmed_at: Date | null; completed_at: Date | null; created_at: Date; updated_at: Date;
  }>(
    `select * from ophanim_imports where id = $1 and organization_id = $2${status ? ' and status = $3' : ''}`,
    status ? [importId, actor.organizationId, status] : [importId, actor.organizationId],
  );
  const row = result.rows[0];
  if (!row) throw new ImportError('Import was not found or is no longer available for this operation.');
  return {
    id: row.id, importType: row.import_type, fileName: row.file_name, fileSizeBytes: row.file_size_bytes, fileEncoding: row.file_encoding,
    columnMapping: row.column_mapping, status: row.status, totalRows: row.total_rows, validRows: row.valid_rows, invalidRows: row.invalid_rows,
    duplicateRows: row.duplicate_rows, processedRows: row.processed_rows, importedRows: row.imported_rows, failedRows: row.failed_rows,
    summary: row.summary ?? {}, confirmedAt: row.confirmed_at?.toISOString() ?? null, completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

async function refreshImportCounts(importId: string): Promise<{ status: ImportStatus; processedRows: number; importedRows: number; failedRows: number }> {
  const updated = await db().query<{ status: ImportStatus; processed_rows: number; imported_rows: number; failed_rows: number }>(
    `with counts as (
       select import_id,
         count(*) filter (where row_status <> 'valid')::integer as processed_rows,
         count(*) filter (where row_status = 'imported')::integer as imported_rows,
         count(*) filter (where row_status in ('invalid', 'duplicate_in_file', 'duplicate_existing', 'failed'))::integer as failed_rows,
         count(*) filter (where row_status = 'valid')::integer as remaining_rows
       from ophanim_import_rows where import_id = $1 group by import_id
     ) update ophanim_imports imports set
       processed_rows = counts.processed_rows,
       imported_rows = counts.imported_rows,
       failed_rows = counts.failed_rows,
       status = case when counts.remaining_rows = 0 then 'completed' else 'running' end,
       completed_at = case when counts.remaining_rows = 0 then now() else null end,
       summary = jsonb_build_object('acceptedRows', counts.imported_rows, 'rejectedRows', counts.failed_rows),
       updated_at = now()
     from counts where imports.id = counts.import_id
     returning imports.status, imports.processed_rows, imports.imported_rows, imports.failed_rows`,
    [importId],
  );
  const row = updated.rows[0];
  if (!row) throw new ImportError('Import progress could not be updated.');
  return { status: row.status, processedRows: row.processed_rows, importedRows: row.imported_rows, failedRows: row.failed_rows };
}

export async function processImportRows(actor: OrganizationActor, importId: string, limit: number): Promise<PersistedImport> {
  const imported = await readImport(actor, importId);
  assertImportFeature(imported.importType);
  const adapter = getImportAdapter(imported.importType);
  if (!adapter.available || !adapter.persist) throw new ImportError(adapter.unavailableReason ?? 'This import type is unavailable.');

  const rows = await db().query<ImportProcessRow>(
    `select id, normalized_data from ophanim_import_rows where import_id = $1 and row_status = 'valid'
     order by row_number limit $2`,
    [importId, limit],
  );
  const normalized = rows.rows.flatMap((row) => row.normalized_data ? [row.normalized_data] : []);
  const existing = adapter.findExisting ? await adapter.findExisting(actor, normalized) : new Set<string>();

  for (const row of rows.rows) {
    if (!row.normalized_data) continue;
    const key = adapter.duplicateKey(row.normalized_data);
    if (existing.has(key)) {
      await db().query(
        `update ophanim_import_rows set row_status = 'duplicate_existing', errors = errors || $2::jsonb, updated_at = now() where id = $1`,
        [row.id, JSON.stringify([`${adapter.label} already exists in this organization.`])],
      );
      continue;
    }
    try {
      const created = await adapter.persist(actor, row.normalized_data);
      existing.add(key);
      await db().query(
        `update ophanim_import_rows set row_status = 'imported', imported_entity_type = $2, imported_entity_id = $3, updated_at = now() where id = $1`,
        [row.id, created.entityType, created.entityId],
      );
    } catch (error) {
      const duplicate = isUniqueConflict(error);
      await db().query(
        `update ophanim_import_rows set row_status = $2, errors = errors || $3::jsonb, updated_at = now() where id = $1`,
        [row.id, duplicate ? 'duplicate_existing' : 'failed', JSON.stringify([duplicate ? `${adapter.label} already exists in this organization.` : errorMessage(error)])],
      );
    }
  }

  const progress = await refreshImportCounts(importId);
  if (progress.status === 'completed') {
    await db().query(
      `insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata)
       values ($1, $2, 'import.completed', 'import', $3, $4)`,
      [actor.organizationId, actor.userId, importId, JSON.stringify(progress)],
    );
  }
  return readImport(actor, importId);
}

export async function confirmImport(actor: OrganizationActor, importId: string): Promise<ImportConfirmation> {
  requireOrganizationAccess(actor, actor.organizationId, 'import:write');
  const client = await db().connect();
  let shouldQueue = false;
  try {
    await client.query('begin');
    const result = await client.query<{ import_type: ImportType; valid_rows: number }>(
      `select import_type, valid_rows from ophanim_imports where id = $1 and organization_id = $2 and status = 'previewed' for update`,
      [importId, actor.organizationId],
    );
    const pending = result.rows[0];
    if (!pending) throw new ImportError('Import was not found or is no longer available for confirmation.');
    assertImportFeature(pending.import_type);
    const adapter = getImportAdapter(pending.import_type);
    if (!adapter.available) throw new ImportError(adapter.unavailableReason ?? 'This import type is unavailable.');
    shouldQueue = pending.valid_rows > IMPORT_BACKGROUND_ROW_THRESHOLD;
    await client.query(
      `update ophanim_imports set status = $2, confirmed_at = now(), updated_at = now() where id = $1`,
      [importId, shouldQueue ? 'queued' : 'running'],
    );
    if (shouldQueue) {
      await client.query(`insert into ophanim_import_jobs (import_id) values ($1) on conflict (import_id) do nothing`, [importId]);
    }
    await client.query(
      `insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata)
       values ($1, $2, 'import.confirmed', 'import', $3, $4)`,
      [actor.organizationId, actor.userId, importId, JSON.stringify({ mode: shouldQueue ? 'queued' : 'synchronous' })],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }

  const completed = shouldQueue ? await readImport(actor, importId) : await processImportRows(actor, importId, Number.MAX_SAFE_INTEGER);
  return { import: completed, mode: shouldQueue ? 'queued' : 'synchronous' };
}

async function claimImportJob(): Promise<ImportJobRow | null> {
  const client = await db().connect();
  try {
    await client.query('begin');
    const claimed = await client.query<ImportJobRow>(
      `with candidate as (
         select jobs.id from ophanim_import_jobs jobs
         where jobs.status = 'queued' and jobs.next_attempt_at <= now()
         order by jobs.next_attempt_at, jobs.created_at for update skip locked limit 1
       ) update ophanim_import_jobs jobs set status = 'running', attempts = attempts + 1, started_at = coalesce(started_at, now()), updated_at = now()
       from candidate join ophanim_imports imports on imports.id = jobs.import_id
       where jobs.id = candidate.id
       returning jobs.id, jobs.import_id, jobs.attempts, imports.created_by_user_id, imports.organization_id, imports.import_type`,
    );
    await client.query('commit');
    return claimed.rows[0] ?? null;
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}

async function actorForJob(job: ImportJobRow): Promise<OrganizationActor> {
  if (!job.created_by_user_id) throw new ImportError('The import creator is no longer available.');
  const membership = await db().query<{ role: OrganizationActor['role'] }>(
    `select role from ophanim_organization_memberships where organization_id = $1 and user_id = $2`,
    [job.organization_id, job.created_by_user_id],
  );
  const role = membership.rows[0]?.role;
  if (!role) throw new ImportError('The import creator no longer belongs to this organization.');
  return { userId: job.created_by_user_id, organizationId: job.organization_id, role };
}

export async function runImportJobs(limit = 3): Promise<{ processed: number; completed: number; failed: number }> {
  let processed = 0; let completed = 0; let failed = 0;
  for (let count = 0; count < limit; count += 1) {
    const job = await claimImportJob();
    if (!job) break;
    processed += 1;
    try {
      const current = await processImportRows(await actorForJob(job), job.import_id, IMPORT_JOB_BATCH_SIZE);
      if (current.status === 'completed') {
        completed += 1;
        await db().query(`update ophanim_import_jobs set status = 'completed', completed_at = now(), updated_at = now() where id = $1`, [job.id]);
      } else {
        await db().query(`update ophanim_import_jobs set status = 'queued', attempts = 0, next_attempt_at = now(), updated_at = now() where id = $1`, [job.id]);
      }
    } catch (error) {
      failed += 1;
      const retry = job.attempts < IMPORT_JOB_MAX_ATTEMPTS;
      await db().query(
        `update ophanim_import_jobs set status = $2, last_error = $3, next_attempt_at = now() + ($4 * interval '1 minute'), completed_at = case when $2 = 'failed' then now() else null end, updated_at = now() where id = $1`,
        [job.id, retry ? 'queued' : 'failed', errorMessage(error), job.attempts],
      );
      if (!retry) await db().query(`update ophanim_imports set status = 'failed', completed_at = now(), summary = summary || $2::jsonb, updated_at = now() where id = $1`, [job.import_id, JSON.stringify({ error: errorMessage(error) })]);
    }
  }
  return { processed, completed, failed };
}
