import { NextRequest, NextResponse } from 'next/server';
import { searchProviders } from '@/lib/providers';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp, 60, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const response = await searchProviders({
      query: searchParams.get('q'),
      lat: searchParams.get('lat'),
      lng: searchParams.get('lng'),
      limit: searchParams.get('limit'),
      mode: searchParams.get('mode'),
    });
    return NextResponse.json(response, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid search request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
