import { NextRequest, NextResponse } from 'next/server';
import { collectIntelligenceEvents } from '@/lib/intelligence/event-provider-registry';
import { SPECIALIST_SOURCES } from '@/lib/intelligence/specialist-providers';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (isRateLimited(`public-intelligence:${getClientIp(request)}`, 20)) return NextResponse.json({ error: 'Rate limit reached.' }, { status: 429 });
  const country = request.nextUrl.searchParams.get('country') || undefined;
  if (country && !/^[a-z][a-z-]{1,69}$/.test(country)) return NextResponse.json({ error: 'Invalid country slug.' }, { status: 400 });
  const providerIds = SPECIALIST_SOURCES.filter(source => source.format !== 'govuk' || country).map(source => source.id);
  const result = await collectIntelligenceEvents({ providerIds, parameters: country ? { country } : undefined, limitPerProvider: 100 });
  return NextResponse.json({ ...result, sources: SPECIALIST_SOURCES, coverage: 'Official source regions shown individually. This is not comprehensive global alert coverage.', checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
}
