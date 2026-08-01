import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { disruptionMapLayer, getDisruption } from '@/lib/logistics/disruptions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Disruption ID is invalid.' }, { status: 400 });
    const disruption = await getDisruption(await requireAuthenticatedActor(request, 'disruption:read'), id);
    if (!disruption) return NextResponse.json({ error: 'Disruption not found.' }, { status: 404 });
    return NextResponse.json({ layers: disruptionMapLayer(disruption) }, { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Disruption map layer failed.' }, { status: 400 });
  }
}
