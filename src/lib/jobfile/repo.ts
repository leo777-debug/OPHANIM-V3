// Tenant-scoped table access for job files. Every read and write carries an
// organization predicate; there is no call that crosses organizations.
// Postgres when DATABASE_URL is set, otherwise an in-process SYNTHETIC DEMO store.
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db/pool';

type Spec = { json?: string[]; numeric?: string[]; shared?: boolean; noOrg?: boolean };
export const TABLES = {
  ophanim_counterparties: { json: ['identifiers'] },
  ophanim_job_files: { numeric: ['declared_value'] },
  ophanim_job_references: {},
  ophanim_job_legs: {},
  ophanim_job_milestones: { numeric: ['confidence'] },
  ophanim_job_piece_counts: { numeric: ['weight_kg'] },
  ophanim_job_checks: { json: ['details'] },
  ophanim_accepted_differences: {},
  ophanim_lessons: { shared: true },
  ophanim_staff_error_events: {},
  ophanim_today_items: { json: ['payload'], numeric: ['probability', 'cost', 'priority'] },
  ophanim_sites: { shared: true },
  ophanim_driver_links: {},
  ophanim_site_events: {},
  ophanim_invoices: { json: ['lines'], numeric: ['subtotal', 'vat_amount', 'total', 'quote_total'] },
  ophanim_intake_items: { json: ['references_found', 'match_candidates'] },
  ophanim_document_types: { json: ['fields', 'keywords'], shared: true },
  ophanim_rule_packs: { json: ['required_documents'], shared: true },
  ophanim_milestone_templates: { json: ['steps'], shared: true },
  ophanim_step_durations: { numeric: ['p10_hours', 'p50_hours', 'p90_hours', 'grace_hours'] },
  ophanim_source_report_lags: { json: ['lag_samples_hours'] },
  ophanim_paper_templates: { json: ['layout'] },
  ophanim_generated_papers: { json: ['data'] },
  ophanim_city_pulse_events: { json: ['weekly'], shared: true },
  ophanim_airport_weather: { shared: true },
  ophanim_documents: {},
  ophanim_extracted_fields: { json: ['bbox'], numeric: ['confidence'] },
  ophanim_feature_snapshots: { json: ['features'] },
  ophanim_forecast_questions: { json: ['threshold'] },
  ophanim_forecasts: { json: ['prediction', 'drivers', 'rules_fired', 'analogs'], numeric: ['probability', 'base_rate'] },
  ophanim_forecast_interactions: {},
  ophanim_forecast_outcomes: { json: ['evidence'], numeric: ['outcome_value'] },
  ophanim_forecast_scores: { numeric: ['brier', 'log_loss', 'abs_error_hours'] },
  ophanim_audit_events: { json: ['metadata'] },
  ophanim_import_mapping_profiles: { json: ['field_mapping', 'relationship_mapping', 'custom_field_mapping'] },
  ophanim_events: { json: ['geometry', 'attributes', 'metadata'], shared: true },
} satisfies Record<string, Spec>;
export type Table = keyof typeof TABLES;
export type Row = Record<string, unknown>;
export type Where = Record<string, unknown>;
export type SelectOptions = { order?: string; limit?: number; shared?: boolean };

export interface Repo {
  readonly mode: 'database' | 'demo';
  insert<T extends Row = Row>(table: Table, organizationId: string, row: Row): Promise<T>;
  update<T extends Row = Row>(table: Table, organizationId: string, where: Where, patch: Row): Promise<T[]>;
  select<T extends Row = Row>(table: Table, organizationId: string, where?: Where, options?: SelectOptions): Promise<T[]>;
  remove(table: Table, organizationId: string, where: Where): Promise<number>;
}

const UPDATED_AT = new Set<Table>(['ophanim_job_files', 'ophanim_today_items', 'ophanim_invoices', 'ophanim_job_milestones', 'ophanim_step_durations', 'ophanim_source_report_lags', 'ophanim_paper_templates']);
const snake = (key: string) => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const camel = (key: string) => key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;
function column(key: string) { const name = snake(key); if (!IDENTIFIER.test(name)) throw new Error(`Invalid column ${key}`); return name; }
function order(value?: string) {
  if (!value) return '';
  const parts = value.split(',').map(part => { const [name, direction = 'asc'] = part.trim().split(/\s+/); if (!/^(asc|desc)$/i.test(direction)) throw new Error('Invalid order'); return `${column(name)} ${direction}`; });
  return ` order by ${parts.join(', ')}`;
}

function fromDb(table: Table, row: Row): Row {
  const spec: Spec = TABLES[table];
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [camel(key),
    value instanceof Date ? value.toISOString() : spec.numeric?.includes(key) && typeof value === 'string' ? Number(value) : value]));
}
function toDb(table: Table, row: Row) {
  const spec: Spec = TABLES[table];
  return Object.entries(row).filter(([, value]) => value !== undefined).map(([key, value]) => {
    const name = column(key);
    return [name, spec.json?.includes(name) && value !== null ? JSON.stringify(value) : value] as const;
  });
}

export function postgresRepo(query = (sql: string, values: unknown[]) => db().query(sql, values)): Repo {
  const predicate = (table: Table, where: Where, values: unknown[], shared = false) => {
    // values[0] is always the caller's organization.
    const clauses = [(TABLES[table] as Spec).shared && shared ? `(organization_id = $1 or organization_id is null)` : `organization_id = $1`];
    for (const [key, value] of Object.entries(where)) {
      if (key === 'organizationId') continue;
      if (value === null) { clauses.push(`${column(key)} is null`); continue; }
      values.push(value); clauses.push(Array.isArray(value) ? `${column(key)} = any($${values.length})` : `${column(key)} = $${values.length}`);
    }
    return clauses.join(' and ');
  };
  return {
    mode: 'database',
    async insert(table, organizationId, row) {
      const entries = toDb(table, { ...row, organizationId });
      const result = await query(`insert into ${table} (${entries.map(([name]) => name).join(',')}) values (${entries.map((_, index) => `$${index + 1}`).join(',')}) returning *`, entries.map(([, value]) => value));
      return fromDb(table, result.rows[0]) as never;
    },
    async update(table, organizationId, where, patch) {
      const sets = toDb(table, { ...patch, ...(UPDATED_AT.has(table) ? { updatedAt: new Date().toISOString() } : {}) });
      // Where-clause placeholders follow the SET values.
      const whereValues: unknown[] = [organizationId], whereSql = predicate(table, where, whereValues);
      const shifted = whereSql.replace(/\$(\d+)/g, (_, index: string) => `$${Number(index) + sets.length}`);
      const result = await query(`update ${table} set ${sets.map(([name], index) => `${name} = $${index + 1}`).join(', ')} where ${shifted} returning *`, [...sets.map(([, value]) => value), ...whereValues]);
      return result.rows.map(row => fromDb(table, row)) as never;
    },
    async select(table, organizationId, where = {}, options = {}) {
      const values: unknown[] = [organizationId];
      const result = await query(`select * from ${table} where ${predicate(table, where, values, options.shared)}${order(options.order)}${options.limit ? ` limit ${Math.min(5000, Math.max(1, Math.floor(options.limit)))}` : ''}`, values);
      return result.rows.map(row => fromDb(table, row)) as never;
    },
    async remove(table, organizationId, where) {
      const values: unknown[] = [organizationId];
      const result = await query(`delete from ${table} where ${predicate(table, where, values)}`, values);
      return result.rowCount ?? 0;
    },
  };
}

/** In-process store for demo/stub mode. Data is SYNTHETIC DEMO only and resets on restart. */
export function memoryRepo(): Repo {
  const tables = new Map<Table, Row[]>();
  const rows = (table: Table) => { if (!tables.has(table)) tables.set(table, []); return tables.get(table)!; };
  const matches = (table: Table, organizationId: string, row: Row, where: Where, shared = false) =>
    (row.organizationId === organizationId || (shared && (TABLES[table] as Spec).shared && row.organizationId == null))
    && Object.entries(where).every(([key, value]) => key === 'organizationId' || (Array.isArray(value) ? value.includes(row[key]) : value === null ? row[key] == null : row[key] === value));
  const clone = <T,>(value: T): T => structuredClone(value);
  return {
    mode: 'demo',
    async insert(table, organizationId, row) {
      const now = new Date().toISOString();
      const stored: Row = { id: randomUUID(), createdAt: now, ...(table === 'ophanim_forecasts' || table === 'ophanim_forecast_questions' ? {} : { updatedAt: now }), ...clone(row), organizationId };
      if (table === 'ophanim_forecasts') stored.issuedAt ??= now;
      rows(table).push(stored); return clone(stored) as never;
    },
    async update(table, organizationId, where, patch) {
      const updated = rows(table).filter(row => matches(table, organizationId, row, where));
      for (const row of updated) Object.assign(row, clone(patch), { updatedAt: new Date().toISOString() });
      return clone(updated) as never;
    },
    async select(table, organizationId, where = {}, options = {}) {
      let result = rows(table).filter(row => matches(table, organizationId, row, where, options.shared));
      if (options.order) {
        const keys = options.order.split(',').map(part => { const [name, direction = 'asc'] = part.trim().split(/\s+/); return { name, sign: direction.toLowerCase() === 'desc' ? -1 : 1 }; });
        result = [...result].sort((a, b) => { for (const { name, sign } of keys) { const left = a[name] as string | number, right = b[name] as string | number; if (left === right) continue; if (left == null) return 1; if (right == null) return -1; return (left < right ? -1 : 1) * sign; } return 0; });
      }
      return clone(options.limit ? result.slice(0, options.limit) : result) as never;
    },
    async remove(table, organizationId, where) {
      const all = rows(table), keep = all.filter(row => !matches(table, organizationId, row, where));
      tables.set(table, keep); return all.length - keep.length;
    },
  };
}
