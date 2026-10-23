import { NextResponse } from 'next/server';

// A deployment can run newer code before `node db/run-migrations.mjs` has
// been applied to its database. These helpers let read paths keep working on
// the older schema and turn the remaining failures into a plain message
// instead of raw PostgreSQL text such as `column "historical" does not exist`.

interface Queryable {
  query: (text: string, values?: unknown[]) => Promise<{ rowCount: number | null; rows: unknown[] }>;
}

// undefined_table, undefined_column, undefined_object (roles, types), undefined_function
const PENDING_CODES = new Set(['42P01', '42703', '42704', '42883']);
const PENDING_TEXT = /\b(relation|column|role|function|type|schema) "[^"]+"( of relation "[^"]+")? does not exist/i;

export const SCHEMA_PENDING_MESSAGE =
  'This part of Ophanim is waiting for a database update. It starts working once the latest database migrations are applied.';

export function isSchemaPendingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && PENDING_CODES.has(code)) return true;
  return error instanceof Error && PENDING_TEXT.test(error.message);
}

/** 503 response for a write or detail request that needs a newer schema. */
export function schemaPendingResponse(headers?: HeadersInit) {
  return NextResponse.json({ error: SCHEMA_PENDING_MESSAGE, setupPending: true }, { status: 503, headers });
}

// Only positive answers are cached: once a migration lands, the next request
// sees it without a restart, and an applied object never disappears.
const present = new Set<string>();

export async function tableExists(client: Queryable, table: string): Promise<boolean> {
  const key = `table:${table}`;
  if (present.has(key)) return true;
  const result = await client.query('select to_regclass($1) is not null as found', [`public.${table}`]);
  const found = Boolean((result.rows[0] as { found?: boolean } | undefined)?.found);
  if (found) present.add(key);
  return found;
}

export async function columnExists(client: Queryable, table: string, column: string): Promise<boolean> {
  const key = `column:${table}.${column}`;
  if (present.has(key)) return true;
  const result = await client.query(
    `select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2`,
    [table, column],
  );
  const found = Boolean(result.rowCount);
  if (found) present.add(key);
  return found;
}

/** Test hook: forget cached schema answers. */
export function resetSchemaCache() {
  present.clear();
}
