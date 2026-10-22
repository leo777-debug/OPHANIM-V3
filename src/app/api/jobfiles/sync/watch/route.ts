import { mkdir, readdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { cronAuthorized, headers, jobError, systemContext } from '@/lib/jobfile/context';
import { importTrackingSheet } from '@/lib/jobfile/sync';
export const dynamic = 'force-dynamic';

/** Cron: import sheets dropped into JOBFILE_WATCH_DIR for JOBFILE_WATCH_ORGANIZATION_ID. "<source>__anything.xlsx" names the source. */
export async function POST(request: NextRequest) {
  try {
    if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers });
    const directory = process.env.JOBFILE_WATCH_DIR, organizationId = process.env.JOBFILE_WATCH_ORGANIZATION_ID;
    if (!directory || !organizationId) return NextResponse.json({ status: 'stub', message: 'Set JOBFILE_WATCH_DIR and JOBFILE_WATCH_ORGANIZATION_ID to watch an upload folder.' }, { headers });
    const root = path.resolve(directory), done = path.join(root, 'processed'); await mkdir(done, { recursive: true });
    const ctx = await systemContext(organizationId), results = [];
    for (const name of (await readdir(root)).filter(file => /\.(csv|xlsx)$/i.test(file)).slice(0, 20)) {
      const file = path.join(root, path.basename(name)), source = name.includes('__') ? name.split('__')[0] : 'watched-folder';
      try { results.push({ file: name, ...(await importTrackingSheet(ctx, { sourceKey: `watch:${source.toLowerCase()}`, fileName: name, mimeType: name.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: await readFile(file) })) }); }
      catch (error) { results.push({ file: name, error: error instanceof Error ? error.message : 'failed' }); }
      await rename(file, path.join(done, `${Date.now()}-${path.basename(name)}`));
    }
    return NextResponse.json({ status: 'ok', results }, { headers });
  } catch (error) { return jobError(error); }
}
