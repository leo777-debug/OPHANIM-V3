import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { platformError } from '@/lib/platform/http';
import { listShipments } from '@/lib/logistics/shipments';
import { boundedJson } from '@/lib/http/body';
import { assessShipmentScenario, parseScenario } from '@/lib/route-intelligence/scenarios';
import { isRateLimited } from '@/lib/ssrf-guard';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'shipment:read');
    if (isRateLimited(`scenario:${actor.organizationId}`, 5)) return NextResponse.json({ error: 'Please wait before recalculating.' }, { status: 429 });
    const scenario = parseScenario(await boundedJson(request));
    return NextResponse.json(await assessShipmentScenario(await listShipments(actor), scenario), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return platformError(error); }
}
