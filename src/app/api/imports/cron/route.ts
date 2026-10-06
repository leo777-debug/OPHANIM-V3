import { NextRequest, NextResponse } from 'next/server';
import { runImportJobs } from '@/lib/imports/jobs';
import { processEntityImports } from '@/lib/imports/generic-entity-import';
import { recordJobRun } from '@/lib/platform/observability';

function authorized(request: NextRequest): boolean {
  const secret = process.env.IMPORT_CRON_SECRET;
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  try {
    const [legacy, entities] = await Promise.all([runImportJobs(), processEntityImports()]);
    await recordJobRun('imports', 'completed', { durationMs: Date.now() - started, metadata: { entityImports: entities } });
    return NextResponse.json({ ...legacy, entityImports: entities });
  } catch (error) {
    await recordJobRun('imports', 'failed', { durationMs: Date.now() - started, error: error instanceof Error ? error.message : 'Import worker failed.' }).catch(() => {});
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import worker failed.' }, { status: 500 });
  }
}
