import { NextRequest, NextResponse } from 'next/server';
import { exploreSeaRoute, findReferencePorts, type Point, PASSAGES } from '@/lib/route-intelligence/open-network';
import { closureScenario, eventsAlongRoute } from '@/lib/route-intelligence/scenario';
import { collectIntelligenceEvents } from '@/lib/intelligence/event-provider-registry';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { boundedJson } from '@/lib/http/body';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (query.length < 2 || query.length > 100) return NextResponse.json({ error: 'Search reference ports with 2–100 characters.' }, { status: 400 });
  if (isRateLimited(`ports:${getClientIp(request)}`, 30)) return NextResponse.json({ error: 'Rate limit reached.' }, { status: 429 });
  return NextResponse.json({ ports: await findReferencePorts(query), reference: true }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
export async function POST(request: NextRequest) {
  if (isRateLimited(`route-model:${getClientIp(request)}`, 10)) return NextResponse.json({ error: 'Rate limit reached.' }, { status: 429 });
  try {
    const body = await boundedJson(request, 5000) as { origin?: unknown; destination?: unknown; closed?: unknown; speedKnots?: number; includeEvents?: boolean; closedDays?: number };
    if (!body || !Array.isArray(body.origin) || !Array.isArray(body.destination)) throw new Error('Choose an origin and destination.');
    if (body.closed !== undefined && (!Array.isArray(body.closed) || body.closed.some((id: unknown) => typeof id !== 'string' || !PASSAGES[id]))) throw new Error('Choose a registered chokepoint.');
    const result = await exploreSeaRoute(body.origin as Point, body.destination as Point, { closed: body.closed as string[] | undefined, speedKnots: body.speedKnots });
    let context: Awaited<ReturnType<typeof collectIntelligenceEvents>> | null = null;
    if (body.includeEvents === true) context = await collectIntelligenceEvents({ providerIds: ['usgs-earthquakes', 'nasa-eonet'], limitPerProvider: 100 });
    const scenario = body.closedDays !== undefined && result.baseline ? closureScenario(result.baseline, result.alternative, body.closedDays) : null;
    return NextResponse.json({ ...result, scenario, nearbyEvents: context && result.baseline ? eventsAlongRoute(context.events, result.baseline) : [], coverage: context?.diagnostics ?? [], checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Route model failed.' }, { status: 400 }); }
}
