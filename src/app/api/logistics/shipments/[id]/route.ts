import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { archiveShipment, getShipment, updateShipment } from '@/lib/logistics/shipments';

function failure(error: unknown): NextResponse {
  if (error instanceof OrganizationAccessError) return NextResponse.json({ error: error.message }, { status: 401 });
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Shipment request failed.' }, { status: 400 });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    if (!isUuid(id)) return NextResponse.json({ error: 'Shipment id is invalid.' }, { status: 400 });
    const shipment = await getShipment(await requireAuthenticatedActor(request, 'shipment:read'), id);
    return shipment ? NextResponse.json({ shipment }) : NextResponse.json({ error: 'Shipment not found.' }, { status: 404 });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    if (!isUuid(id)) return NextResponse.json({ error: 'Shipment id is invalid.' }, { status: 400 });
    const shipment = await updateShipment(await requireAuthenticatedActor(request, 'shipment:write'), id, await request.json());
    return shipment ? NextResponse.json({ shipment }) : NextResponse.json({ error: 'Shipment not found.' }, { status: 404 });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuthenticatedActor(request, 'shipment:archive');
    const archived = await archiveShipment(actor, (await params).id);
    return archived ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: 'Shipment not found.' }, { status: 404 });
  } catch (error) { return failure(error); }
}
