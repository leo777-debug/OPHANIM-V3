import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError, requireOrganizationAccess } from '@/lib/operations/authorization';
import { getImportAdapter } from '@/lib/imports/adapters/types';
import type { ImportType } from '@/lib/imports/types';

const importTypes = new Set<ImportType>(['shipment', 'cyber_client', 'cyber_asset', 'vendor_dependency']);
export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  try {
    const actor = await requireAuthenticatedActor(request, 'import:read');
    requireOrganizationAccess(actor, actor.organizationId, 'import:read');
    const type = (await params).type as ImportType;
    if (!importTypes.has(type)) return NextResponse.json({ error: 'Import type was not found.' }, { status: 404 });
    const adapter = getImportAdapter(type);
    const header = adapter.columns.map((column) => column.label.replaceAll('"', '""')).map((value) => `"${value}"`).join(',');
    return new NextResponse(`${header}\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ophanim-${type}-template.csv"`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof OrganizationAccessError ? 401 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create the import template.' }, { status });
  }
}
