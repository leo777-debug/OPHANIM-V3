import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { assertImportFeature } from '@/lib/imports/access';
import { getImport, getImportRows } from '@/lib/imports/repository';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { importIdFrom } from '@/lib/imports/route-id';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await importIdFrom(request, params);
    if (!id) return NextResponse.json({ error: 'Import id is invalid.' }, { status: 400 });
    const actor = await requireAuthenticatedActor(request, 'import:read');
    const imported = await getImport(actor, id);
    if (!imported) return NextResponse.json({ error: 'Import was not found.' }, { status: 404 });
    assertImportFeature(imported.importType);
    const rows = await getImportRows(actor, id);
    return NextResponse.json({ import: imported, rows: rows.slice(0, 100), rowCount: rows.length });
  } catch (error) {
    const status = error instanceof OrganizationAccessError ? 401 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import lookup failed.' }, { status });
  }
}
