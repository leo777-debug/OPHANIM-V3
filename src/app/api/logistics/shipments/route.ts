import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { createShipment, listShipments } from '@/lib/logistics/shipments';

function failure(error: unknown): NextResponse {
  if (error instanceof OrganizationAccessError) return NextResponse.json({ error: error.message }, { status: 401 });
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Shipment request failed.' }, { status: 400 });
}

export async function GET(request: NextRequest) {
  try { return NextResponse.json({ shipments: await listShipments(await requireAuthenticatedActor(request, 'shipment:read')) }); }
  catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json({ shipment: await createShipment(await requireAuthenticatedActor(request, 'shipment:write'), await request.json()) }, { status: 201 }); }
  catch (error) { return failure(error); }
}
