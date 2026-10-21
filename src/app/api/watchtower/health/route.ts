import { NextResponse, type NextRequest } from 'next/server';
import { cronAuthorized, headers } from '@/lib/jobfile/context';
import { runFeedHealthCheck } from '@/lib/watchtower/status';
export const dynamic = 'force-dynamic';

/** Cron (JOBFILE_CRON_SECRET): ping verified public feeds; three failures in a row prune a feed from the default view. */
export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers });
  try { const results = await runFeedHealthCheck(); return NextResponse.json({ checked: results.length, results }, { headers }); }
  catch { return NextResponse.json({ error: 'Health check failed.' }, { status: 503, headers }); }
}
