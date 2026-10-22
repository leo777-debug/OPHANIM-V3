import { NextResponse, type NextRequest } from 'next/server';
import { headers, jobContext, jobError } from '@/lib/jobfile/context';
import { buildCsv, buildXlsx, EXPORT_ENTITIES, exportSheets, type ExportEntity } from '@/lib/jobfile/export';
export const dynamic = 'force-dynamic';

/** ?format=xlsx|csv&entity=jobs|milestones|documents|flags|invoices|all[&job=<id>] */
export async function GET(request: NextRequest) {
  try {
    const ctx = await jobContext(request, 'shipment:read'), params = request.nextUrl.searchParams;
    const format = params.get('format') === 'csv' ? 'csv' : 'xlsx', entity = params.get('entity') ?? 'all', job = params.get('job');
    const entities: ExportEntity[] = entity === 'all' ? [...EXPORT_ENTITIES] : EXPORT_ENTITIES.includes(entity as ExportEntity) ? [entity as ExportEntity] : [];
    if (!entities.length || (format === 'csv' && entities.length > 1)) return NextResponse.json({ error: 'CSV exports one entity at a time; use xlsx for all.' }, { status: 400, headers });
    const sheets = await exportSheets(ctx, entities, job && /^[0-9a-f-]{36}$/i.test(job) ? job : undefined);
    const name = `ophanim-${entity}${ctx.actor.demo ? '-SYNTHETIC-DEMO' : ''}-${new Date().toISOString().slice(0, 10)}.${format}`;
    const body = format === 'csv' ? buildCsv(sheets[0]) : buildXlsx(sheets);
    return new NextResponse(typeof body === 'string' ? body : new Uint8Array(body), { headers: { ...headers, 'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${name}"` } });
  } catch (error) { return jobError(error); }
}
