import { NextRequest, NextResponse } from 'next/server';
import { collectIntelligenceEvents } from '@/lib/intelligence/event-provider-registry';
import { AVIATION_SOURCES, parseUsStations } from '@/lib/intelligence/aviation-providers';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (isRateLimited(`aviation-public:${getClientIp(request)}`, 20)) return NextResponse.json({ error: 'Please retry later.' }, { status: 429 });
  let stations: string[];
  try { stations = parseUsStations(request.nextUrl.searchParams.get('stations') ?? undefined); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid station selection.' }, { status: 400 }); }
  const result = await collectIntelligenceEvents({ providerIds: ['faa-public-status', 'awc-us-metar', 'awc-us-taf'], parameters: { stations: stations.join(',') }, limitPerProvider: 100 });
  return NextResponse.json({ ...result, stations, sources: AVIATION_SOURCES, checkedAt: new Date().toISOString(),
    missingMetarStations: stations.filter(station => !result.events.some(event => event.providerId === 'awc-us-metar' && event.attributes.station === station)),
    missingTafStations: stations.filter(station => !result.events.some(event => event.providerId === 'awc-us-taf' && event.attributes.station === station)),
    coverage: 'FAA public national airport status facts plus selected continental-US K-station METAR/TAF products. This is not full NOTAM coverage. Closure notices can be conditional or scheduled; airport-wide closure is not established by their category.',
    refresh: 'Browser polling every 300 s; FAA cache 120 s, METAR cache 300 s, TAF cache 600 s. Upstream bulletins update periodically; no continuous stream is implied.'
  }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
}
