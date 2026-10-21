// Spreadsheet sync and connectors. Reuses the existing import parser and the
// ophanim_import_mapping_profiles table: one remembered mapping per source.
import { parseImportFile } from '@/lib/imports/file-parser';
import { validateReference, type ReferenceType } from './identifiers';
import { recordMilestone, recordPieceCount } from './milestones';
import { addReference, audit, createJobFile, JobFileInputError } from './service';
import type { Ctx, JobFile, JobMode, JobReference } from './types';
import { JOB_MODES } from './types';

export type SyncField = 'job_number' | 'mode' | 'client' | 'origin' | 'destination' | 'awb' | 'hawb' | 'bl' | 'container' | 'etd' | 'eta' | 'arrived_at' | 'delivered_at' | 'pieces' | 'weight_kg';
const FIELDS: Array<{ key: SyncField; aliases: string[]; shape?: RegExp }> = [
  { key: 'job_number', aliases: ['job', 'job no', 'job number', 'file no', 'file number', 'shipment ref', 'our ref', 'reference'] },
  { key: 'mode', aliases: ['mode', 'transport mode', 'service'] },
  { key: 'client', aliases: ['client', 'customer', 'consignee', 'shipper name'] },
  { key: 'origin', aliases: ['origin', 'pol', 'port of loading', 'from', 'departure airport'] },
  { key: 'destination', aliases: ['destination', 'pod', 'port of discharge', 'to', 'arrival airport'] },
  { key: 'awb', aliases: ['awb', 'mawb', 'air waybill', 'awb no', 'mawb no'], shape: /^\d{3}[-\s]?\d{8}$/ },
  { key: 'hawb', aliases: ['hawb', 'house awb', 'hawb no'] },
  { key: 'bl', aliases: ['bl', 'b/l', 'mbl', 'bill of lading', 'bl no'], shape: /^[A-Z]{4}\d{6,12}$/i },
  { key: 'container', aliases: ['container', 'container no', 'cntr', 'box'], shape: /^[A-Z]{3}[UJZ]\d{7}$/i },
  { key: 'etd', aliases: ['etd', 'departure', 'planned departure'] },
  { key: 'eta', aliases: ['eta', 'arrival', 'planned arrival', 'expected arrival'] },
  { key: 'arrived_at', aliases: ['ata', 'arrived', 'actual arrival', 'arrived at'] },
  { key: 'delivered_at', aliases: ['delivered', 'pod date', 'delivery date', 'delivered at'] },
  { key: 'pieces', aliases: ['pieces', 'pcs', 'packages', 'pkgs', 'qty'], shape: /^\d{1,6}$/ },
  { key: 'weight_kg', aliases: ['weight', 'gross weight', 'gw', 'weight kg', 'kgs'], shape: /^\d+(\.\d+)?$/ },
];
const norm = (value: string) => value.trim().toLowerCase().replace(/[_\-./]+/g, ' ').replace(/\s+/g, ' ');
const tokens = (value: string) => new Set(norm(value).split(' ').filter(Boolean));
const jaccard = (a: Set<string>, b: Set<string>) => { const inter = [...a].filter(item => b.has(item)).length; return inter / Math.max(1, new Set([...a, ...b]).size); };

export type Mapping = Partial<Record<SyncField, string>>;
export function suggestMapping(headers: string[]): Mapping {
  const byNorm = new Map(headers.map(header => [norm(header), header]));
  return Object.fromEntries(FIELDS.flatMap(field => { const header = field.aliases.map(alias => byNorm.get(alias)).find(Boolean); return header ? [[field.key, header]] : []; }));
}
export type Remap = { field: SyncField; from: string; to: string; score: number };
/**
 * Detect renamed columns: a remembered header that is gone is matched to a new
 * header by name similarity and by the shape of its values (e.g. AWB pattern).
 */
export function detectChangedColumns(saved: Mapping, savedHeaders: string[], headers: string[], rows: Array<Record<string, string>>): { mapping: Mapping; remapped: Remap[]; missing: SyncField[] } {
  const present = new Set(headers), mapping: Mapping = {}, remapped: Remap[] = [], missing: SyncField[] = [];
  const fresh = headers.filter(header => !savedHeaders.includes(header)), taken = new Set<string>();
  for (const [field, header] of Object.entries(saved) as Array<[SyncField, string]>) {
    if (present.has(header)) { mapping[field] = header; taken.add(header); continue; }
    const spec = FIELDS.find(item => item.key === field)!;
    const scored = fresh.filter(candidate => !taken.has(candidate)).map(candidate => {
      const name = Math.max(jaccard(tokens(header), tokens(candidate)), ...spec.aliases.map(alias => norm(alias) === norm(candidate) ? 1 : jaccard(tokens(alias), tokens(candidate))));
      const samples = rows.slice(0, 20).map(row => (row[candidate] ?? '').trim()).filter(Boolean);
      const shape = spec.shape && samples.length ? samples.filter(value => spec.shape!.test(value)).length / samples.length : 0;
      return { candidate, score: Math.round(Math.max(name, spec.shape ? 0.4 * name + 0.6 * shape : name) * 100) / 100 };
    }).sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best && best.score >= 0.5 && (!scored[1] || scored[1].score < best.score)) { mapping[field] = best.candidate; taken.add(best.candidate); remapped.push({ field, from: header, to: best.candidate, score: best.score }); }
    else missing.push(field);
  }
  return { mapping, remapped, missing };
}

type Profile = { id: string; name: string; fieldMapping: Mapping; customFieldMapping: { headers?: string[] } };
const profileName = (sourceKey: string) => `jobfile-sync:${sourceKey}`.slice(0, 240);
const date = (value?: string) => { if (!value?.trim()) return null; const at = Date.parse(value.includes('T') || /[+Z]/.test(value) ? value : `${value.replace(' ', 'T')}${/\d:\d/.test(value) ? '' : 'T00:00'}:00+04:00`); return Number.isFinite(at) ? new Date(at).toISOString() : Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : null; };

/** Import a client's tracking sheet. The mapping is remembered per source; renamed columns are detected and re-mapped. */
export async function importTrackingSheet(ctx: Ctx, input: { sourceKey: string; fileName: string; mimeType: string; bytes: Uint8Array; mapping?: Mapping }) {
  const org = ctx.actor.organizationId, parsed = await parseImportFile(input.fileName, input.mimeType, input.bytes);
  const [headerRow, ...body] = parsed.rows, headers = (headerRow ?? []).map(value => value.trim());
  if (!headers.length) throw new JobFileInputError('The sheet has no header row.');
  const rows = body.filter(row => row.some(cell => cell.trim())).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
  const [profile] = await ctx.repo.select<Profile>('ophanim_import_mapping_profiles', org, { name: profileName(input.sourceKey) });
  let mapping: Mapping, remapped: Remap[] = [], missing: SyncField[] = [];
  if (input.mapping) mapping = input.mapping;
  else if (profile) ({ mapping, remapped, missing } = detectChangedColumns(profile.fieldMapping, profile.customFieldMapping.headers ?? [], headers, rows));
  else mapping = suggestMapping(headers);
  if (!mapping.job_number && !mapping.awb && !mapping.bl && !mapping.container) throw new JobFileInputError('Map a job number or a reference column (AWB, B/L or container).');
  const saved = { fieldMapping: mapping, customFieldMapping: { headers } };
  if (profile) await ctx.repo.update('ophanim_import_mapping_profiles', org, { id: profile.id }, saved);
  else await ctx.repo.insert('ophanim_import_mapping_profiles', org, { name: profileName(input.sourceKey), entityType: 'job_file', delimiter: ',', encoding: 'utf-8', relationshipMapping: {}, ...saved });

  const jobs = await ctx.repo.select<JobFile>('ophanim_job_files', org), references = await ctx.repo.select<JobReference>('ophanim_job_references', org);
  let created = 0, updated = 0; const errors: Array<{ row: number; message: string }> = [];
  for (const [index, row] of rows.entries()) {
    const get = (field: SyncField) => mapping[field] ? row[mapping[field]!]?.trim() ?? '' : '';
    try {
      const refs = (['awb', 'hawb', 'bl', 'container'] as const).flatMap(type => get(type) ? [{ type: type as ReferenceType, value: get(type) }] : []);
      const byRef = refs.map(ref => references.find(item => item.type === ref.type && item.normalizedValue === validateReference(ref.type, ref.value).normalized)).find(Boolean);
      let job = jobs.find(item => get('job_number') && item.jobNumber === get('job_number')) ?? jobs.find(item => item.id === byRef?.jobFileId);
      const mode = (JOB_MODES.includes(get('mode') as JobMode) ? get('mode') : get('awb') ? 'air_import' : 'sea_import') as JobMode;
      const header = { clientName: get('client') || undefined, origin: get('origin') || undefined, destination: get('destination') || undefined, plannedDepartureAt: date(get('etd')) ?? undefined, plannedArrivalAt: date(get('eta')) ?? undefined };
      if (!job) { job = await createJobFile(ctx, { mode, jobNumber: get('job_number') || undefined, createdFrom: 'import', ...header, references: [] }); jobs.push(job); created++; }
      else { const patch = Object.fromEntries(Object.entries(header).filter(([, value]) => value)); if (Object.keys(patch).length) await ctx.repo.update('ophanim_job_files', org, { id: job.id }, patch); updated++; }
      for (const ref of refs) references.push(await addReference(ctx, job.id, ref.type, ref.value, `import:${input.sourceKey}`));
      if (get('arrived_at') && date(get('arrived_at'))) await recordMilestone(ctx, job.id, { code: 'arrived', actualAt: date(get('arrived_at')), source: 'import', sourceKey: `import:${input.sourceKey}` });
      if (get('delivered_at') && date(get('delivered_at'))) await recordMilestone(ctx, job.id, { code: 'delivered', actualAt: date(get('delivered_at')), source: 'import', sourceKey: `import:${input.sourceKey}` });
      if (get('pieces') && /^\d+$/.test(get('pieces'))) await recordPieceCount(ctx, job.id, { handoff: 'booked', pieces: Number(get('pieces')), weightKg: get('weight_kg') ? Number(get('weight_kg').replace(/,/g, '')) || null : null, source: `import:${input.sourceKey}` });
    } catch (error) { errors.push({ row: index + 2, message: error instanceof Error ? error.message : 'Row failed.' }); }
  }
  await audit(ctx, 'sync.imported', 'import', null, { sourceKey: input.sourceKey, rows: rows.length, created, updated, remapped, missing, errors: errors.length });
  return { rows: rows.length, created, updated, remapped, missing, mapping, errors: errors.slice(0, 50) };
}

// ---- Connectors to forwarding/accounting software -------------------------------
/** Contract for CargoWise, Magaya, Zoho, Tally… Real connectors need vendor access and are not built here. */
export interface ForwardingConnector {
  readonly id: string; readonly name: string; readonly kind: 'forwarding' | 'accounting';
  readonly capabilities: Array<'pull_jobs' | 'pull_invoices' | 'push_milestones' | 'push_invoices'>;
  configured(env: NodeJS.ProcessEnv): boolean;
  pullJobs?(ctx: Ctx, input: { fileName: string; mimeType: string; bytes: Uint8Array }): Promise<Awaited<ReturnType<typeof importTrackingSheet>>>;
}
/** Example implementation: reads a CSV/xlsx job export from any forwarding system, with a fixed mapping. */
export const csvExportConnector: ForwardingConnector = {
  id: 'csv-export', name: 'Forwarding system CSV export (example)', kind: 'forwarding', capabilities: ['pull_jobs'],
  configured: () => true,
  pullJobs: (ctx, file) => importTrackingSheet(ctx, { sourceKey: 'connector:csv-export', ...file }),
};
export const CONNECTORS: ForwardingConnector[] = [csvExportConnector];
