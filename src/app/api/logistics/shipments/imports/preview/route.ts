import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { assertImportFeature } from '@/lib/imports/access';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { shipmentImportAdapter } from '@/lib/imports/adapters/shipment';
import { previewImportCsv } from '@/lib/imports/pipeline';
import { persistImportPreview } from '@/lib/imports/repository';
import type { ImportColumnMapping } from '@/lib/imports/types';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'shipment:write');
    assertImportFeature('shipment');
    const body = await request.json() as { fileName?: unknown; csv?: unknown; mapping?: unknown };
    if (typeof body.fileName !== 'string' || typeof body.csv !== 'string') return NextResponse.json({ error: 'CSV file name and content are required.' }, { status: 400 });
    const mapping = body.mapping && typeof body.mapping === 'object' && !Array.isArray(body.mapping) ? body.mapping as ImportColumnMapping : undefined;
    const preview = previewImportCsv(shipmentImportAdapter, body.csv, mapping);
    const shipmentImport = await persistImportPreview(actor, 'shipment', body.fileName, preview);
    return NextResponse.json({ shipmentImport, preview });
  } catch (error) {
    const status = error instanceof OrganizationAccessError ? 401 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import preview failed.' }, { status });
  }
}
