import { NextRequest, NextResponse } from 'next/server';
import { processEntityImports } from '@/lib/imports/generic-entity-import';
import { recordJobRun } from '@/lib/platform/observability';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.IMPORT_CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  try {
    const processed = await processEntityImports();
    await recordJobRun('platform-entity-imports', 'completed', { durationMs: Date.now() - started, metadata: { processed } });
    return NextResponse.json({ processed });
  } catch (error) {
    await recordJobRun('platform-entity-imports', 'failed', { durationMs: Date.now() - started, error: error instanceof Error ? error.message : 'Import processing failed' }).catch(() => {});
    return NextResponse.json({ error: 'Import processing failed.' }, { status: 500 });
  }
}
