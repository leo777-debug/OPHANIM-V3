import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { confirmEntityImport } from '@/lib/imports/generic-entity-import';
import { recordProductEvent } from '@/lib/platform/analytics';
import { requirePlatformCapability } from '@/lib/platform/capabilities';
import { platformError } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuthenticatedActor(request, 'import:write');
    await requirePlatformCapability(actor, 'imports');
    const importRecord = await confirmEntityImport(actor, (await context.params).id);
    void recordProductEvent(actor, 'csv.imported', { entityType: importRecord.entity_type }).catch(() => {});
    return NextResponse.json({ import: importRecord });
  } catch (error) { return platformError(error); }
}
