import { NextRequest, NextResponse } from 'next/server';
import { runImportJobs } from '@/lib/imports/jobs';

function authorized(request: NextRequest): boolean {
  const secret = process.env.IMPORT_CRON_SECRET;
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json(await runImportJobs()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Import worker failed.' }, { status: 500 }); }
}
