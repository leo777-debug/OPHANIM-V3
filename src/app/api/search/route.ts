import { NextRequest, NextResponse } from 'next/server';
import { classifySearch, searchProviders } from '@/lib/providers';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { ShodanError } from '@/lib/shodan/types';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp, 60, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const classified = classifySearch({ query: searchParams.get('q'), mode: searchParams.get('mode'), lat: searchParams.get('lat'), lng: searchParams.get('lng') });
    if (classified.intent === 'shodan_search' && searchParams.get('confirm') !== 'true') throw new ShodanError('confirmation_required', 'Submit the Shodan search explicitly; it can consume query credits.', 400);
    const actor = classified.intent === 'shodan_search' ? await requireAuthenticatedActor(request, 'cyber:read') : null;
    if (actor && !process.env.SHODAN_API_KEY?.trim()) throw new ShodanError('missing_key', 'Shodan is not configured. Ask your administrator to set SHODAN_API_KEY.', 503);
    const response = await searchProviders({
      query: searchParams.get('q'),
      lat: searchParams.get('lat'),
      lng: searchParams.get('lng'),
      limit: searchParams.get('limit'),
      mode: searchParams.get('mode'),
    }, { locale: request.headers.get('accept-language')?.split(',')[0] || 'en', organizationId: actor?.organizationId });
    return NextResponse.json(response, { headers: { 'Cache-Control': actor ? 'no-store' : 'private, max-age=60' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid search request';
    return NextResponse.json({ error: message, ...(error instanceof ShodanError ? { code: error.code } : {}) }, { status: error instanceof ShodanError ? error.status : error instanceof OrganizationAccessError ? 403 : 400 });
  }
}
