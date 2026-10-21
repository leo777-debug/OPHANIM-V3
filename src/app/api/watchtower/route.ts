import { NextResponse, type NextRequest } from 'next/server';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { CATALOGUE_POLICY, camerasForPort, portByCode, PORTS, searchPorts } from '@/lib/watchtower/cameras';
import { readFeedHealth } from '@/lib/watchtower/status';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, max-age=60' };

/** ?q=<port or area> lists matching ports; ?port=<UN/LOCODE> returns that port's public cameras. Public data only. */
export async function GET(request: NextRequest) {
  if (isRateLimited(`watchtower:${getClientIp(request)}`, 60)) return NextResponse.json({ error: 'Please retry in a minute.' }, { status: 429, headers });
  const params = request.nextUrl.searchParams, code = params.get('port');
  try {
    const health = await readFeedHealth().catch(() => new Map());
    if (code) {
      const port = portByCode(code);
      if (!port) return NextResponse.json({ error: 'Unknown port.' }, { status: 404, headers });
      return NextResponse.json({ ...(await camerasForPort(port, health, { includeDead: params.get('dead') === '1' })), policy: CATALOGUE_POLICY.policy }, { headers });
    }
    const ports = params.get('q') ? searchPorts(params.get('q')!) : PORTS;
    return NextResponse.json({ ports, policy: CATALOGUE_POLICY.policy, verification: CATALOGUE_POLICY.verification }, { headers });
  } catch { return NextResponse.json({ error: 'Camera search unavailable.' }, { status: 503, headers }); }
}
