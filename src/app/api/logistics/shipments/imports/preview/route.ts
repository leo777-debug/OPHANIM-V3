import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { assertImportFeature } from '@/lib/imports/access';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { shipmentImportAdapter } from '@/lib/imports/adapters/shipment';
import { previewImportCsv } from '@/lib/imports/pipeline';
import { persistImportPreview } from '@/lib/imports/repository';
import type { ImportColumnMapping } from '@/lib/imports/types';
import { importPreviewLimited } from '@/lib/imports/intake';
import { limitedRequestBytes,RequestBodyLimitError } from '@/lib/http/limited-form-data';
import { MAX_IMPORT_BYTES } from '@/lib/imports/csv';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'shipment:write');
    if(importPreviewLimited(request,actor))return NextResponse.json({error:'Too many import previews. Wait a moment and try again.'},{status:429});
    assertImportFeature('shipment');
    // JSON escaping can double a valid CSV's size; the CSV parser still enforces
    // its own decoded five-megabyte cap after this transport bound.
    const body = JSON.parse(Buffer.from(await limitedRequestBytes(request,MAX_IMPORT_BYTES*2+256*1024)).toString('utf8')) as { fileName?: unknown; csv?: unknown; mapping?: unknown } | null;
    if(!body || typeof body!=='object' || Array.isArray(body))return NextResponse.json({error:'A JSON object is required.'},{status:400});
    if (typeof body.fileName !== 'string' || typeof body.csv !== 'string') return NextResponse.json({ error: 'CSV file name and content are required.' }, { status: 400 });
    const mapping = body.mapping && typeof body.mapping === 'object' && !Array.isArray(body.mapping) ? body.mapping as ImportColumnMapping : undefined;
    const preview = previewImportCsv(shipmentImportAdapter, body.csv, mapping);
    const shipmentImport = await persistImportPreview(actor, 'shipment', body.fileName, preview);
    return NextResponse.json({ shipmentImport, preview });
  } catch (error) {
    const status = error instanceof OrganizationAccessError ? 401 : error instanceof RequestBodyLimitError ? 413 : 400;
    return NextResponse.json({ error: 'Import preview failed.' }, { status });
  }
}
