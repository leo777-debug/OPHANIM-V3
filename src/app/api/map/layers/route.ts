import { NextRequest, NextResponse } from 'next/server';
import { getProviderMapLayers } from '@/lib/providers';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (isRateLimited(getClientIp(request), 30, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const requestedProviders = searchParams.get('providers')?.split(',').map((value) => value.trim()).filter(Boolean);
  const layers = await getProviderMapLayers({ origin: new URL(request.url).origin, requestedProviders });
  return NextResponse.json({ layers }, { headers: { 'Cache-Control': 'private, max-age=30' } });
}
