import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runIntegrationHealthJob } from '@/lib/integrations/health-job';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const expected = process.env.HEALTH_CRON_SECRET, supplied = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!expected || !supplied || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await runIntegrationHealthJob(), { headers: { 'Cache-Control': 'private, no-store' } });
}
