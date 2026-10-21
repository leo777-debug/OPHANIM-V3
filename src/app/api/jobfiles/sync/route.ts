import type { NextRequest } from 'next/server';
import { mutation, query } from '@/lib/jobfile/context';
import { JobFileInputError } from '@/lib/jobfile/service';
import { CONNECTORS, importTrackingSheet, type Mapping } from '@/lib/jobfile/sync';
export const dynamic = 'force-dynamic';

export const GET = (request: NextRequest) => query(request, 'import:read', async ctx => ({
  connectors: CONNECTORS.map(connector => ({ id: connector.id, name: connector.name, kind: connector.kind, capabilities: connector.capabilities })),
  profiles: (await ctx.repo.select<{ name: string; fieldMapping: Mapping; updatedAt: string }>('ophanim_import_mapping_profiles', ctx.actor.organizationId, { entityType: 'job_file' })).map(profile => ({ source: profile.name.replace(/^jobfile-sync:/, ''), mapping: profile.fieldMapping, updatedAt: profile.updatedAt })),
}));

/** Upload a tracking sheet (CSV/xlsx) for a named source; its column mapping is remembered. */
export const POST = (request: NextRequest) => mutation(request, 'import:write', async ctx => {
  const form = await request.formData().catch(() => { throw new JobFileInputError('Send multipart form data.'); });
  const file = form.get('file'), source = String(form.get('source') ?? '').trim().toLowerCase().replace(/[^a-z0-9:._@-]/g, '-').slice(0, 120);
  if (!(file instanceof File) || !source) throw new JobFileInputError('A file and a source name are required.');
  if (file.size > 5 * 1024 * 1024) throw new JobFileInputError('Sheets up to 5 MB.');
  const mapping = form.get('mapping') ? JSON.parse(String(form.get('mapping'))) as Mapping : undefined;
  const connector = String(form.get('connector') ?? '');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const target = CONNECTORS.find(item => item.id === connector);
  return { result: target?.pullJobs ? await target.pullJobs(ctx, { fileName: file.name, mimeType: file.type, bytes }) : await importTrackingSheet(ctx, { sourceKey: source, fileName: file.name, mimeType: file.type, bytes, mapping }) };
});
