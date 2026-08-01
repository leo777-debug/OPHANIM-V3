import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { getDisruption, listDisruptionAssessments } from '@/lib/logistics/disruptions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Disruption ID is invalid.' }, { status: 400 });
    const actor = await requireAuthenticatedActor(request, 'disruption:read');
    const disruption = await getDisruption(actor, id);
    if (!disruption) return NextResponse.json({ error: 'Disruption not found.' }, { status: 404 });
    return NextResponse.json({ disruption, assessments: await listDisruptionAssessments(actor, id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof OrganizationAccessError ? error.message : error instanceof Error ? error.message : 'Disruption request failed.' }, { status: error instanceof OrganizationAccessError ? 403 : 400 });
  }
}
