import { NextRequest, NextResponse } from 'next/server';
import { syncExistingOphanimDisruptions } from '@/lib/logistics/disruption-ingestion';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  if (!process.env.DISRUPTION_SYNC_CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.DISRUPTION_SYNC_CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json(await syncExistingOphanimDisruptions(new URL(request.url).origin)); }
  catch { return NextResponse.json({ error: 'Disruption sync failed.' }, { status: 502 }); }
}
