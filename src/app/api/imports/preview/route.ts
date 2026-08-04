import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { assertImportFeature } from '@/lib/imports/access';
import { getImportAdapter } from '@/lib/imports/adapters/types';
import { decodeUtf8Csv } from '@/lib/imports/csv';
import { previewImportCsv } from '@/lib/imports/pipeline';
import { persistImportPreview } from '@/lib/imports/repository';
import { IMPORT_TYPES, type ImportColumnMapping, type ImportType } from '@/lib/imports/types';
import { OrganizationAccessError } from '@/lib/operations/authorization';

function hasImportType(value: unknown): value is ImportType { return typeof value === 'string' && IMPORT_TYPES.includes(value as ImportType); }

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'import:write');
    const form = await request.formData();
    const importType = form.get('importType');
    const file = form.get('file');
    const rawMapping = form.get('mapping');
    if (!hasImportType(importType)) return NextResponse.json({ error: 'A supported import type is required.' }, { status: 400 });
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') return NextResponse.json({ error: 'Select a CSV file to import.' }, { status: 400 });
    assertImportFeature(importType);
    const mapping = typeof rawMapping === 'string' && rawMapping ? JSON.parse(rawMapping) as ImportColumnMapping : undefined;
    const csv = decodeUtf8Csv(await file.arrayBuffer());
    const adapter = getImportAdapter(importType);
    const preview = previewImportCsv(adapter, csv, mapping);
    const imported = await persistImportPreview(actor, importType, file.name || 'import.csv', preview);
    return NextResponse.json({ import: imported, preview, adapter: { type: adapter.type, label: adapter.label, available: adapter.available, unavailableReason: adapter.unavailableReason } });
  } catch (error) {
    const status = error instanceof OrganizationAccessError ? 401 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import preview failed.' }, { status });
  }
}
