import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { createDisruption, listDisruptions } from '@/lib/logistics/disruptions';

function failure(error: unknown): NextResponse {
  if (error instanceof OrganizationAccessError) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Disruption request failed.' }, { status: 400 });
}

export async function GET(request: NextRequest) {
  try { return NextResponse.json({ disruptions: await listDisruptions(await requireAuthenticatedActor(request, 'disruption:read')) }); }
  catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json({ disruption: await createDisruption(await requireAuthenticatedActor(request, 'disruption:write'), await request.json()) }, { status: 201 }); }
  catch (error) { return failure(error); }
}
