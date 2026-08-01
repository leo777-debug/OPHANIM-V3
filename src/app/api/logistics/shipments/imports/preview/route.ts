import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { previewShipmentCsv, type ShipmentColumnMapping } from '@/lib/logistics/csv-import';
import { persistShipmentImportPreview } from '@/lib/logistics/shipment-import-service';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'shipment:write');
    const body = await request.json() as { fileName?: unknown; csv?: unknown; mapping?: unknown };
    if (typeof body.fileName !== 'string' || typeof body.csv !== 'string') return NextResponse.json({ error: 'CSV file name and content are required.' }, { status: 400 });
    const mapping = body.mapping && typeof body.mapping === 'object' && !Array.isArray(body.mapping) ? body.mapping as ShipmentColumnMapping : undefined;
    const preview = previewShipmentCsv(body.csv, mapping);
    const shipmentImport = await persistShipmentImportPreview(actor, body.fileName, preview);
    return NextResponse.json({ shipmentImport, preview });
  } catch (error) {
    const status = error instanceof OrganizationAccessError ? 401 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import preview failed.' }, { status });
  }
}
