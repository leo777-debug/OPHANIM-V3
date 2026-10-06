import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { createEntityImport } from '@/lib/imports/generic-entity-import';
import { requirePlatformCapability } from '@/lib/platform/capabilities';
import { platformError } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'import:write');
    await requirePlatformCapability(actor, 'imports');
    const form = await request.formData();
    const file = form.get('file');
    const entityType = form.get('entityType');
    const mapping = form.get('mapping');
    if (!(file instanceof File)) throw new Error('A CSV file is required.');
    if (typeof entityType !== 'string' || typeof mapping !== 'string') throw new Error('Entity type and mapping are required.');
    const imported = await createEntityImport(actor, file.name, new Uint8Array(await file.arrayBuffer()), entityType, JSON.parse(mapping));
    return NextResponse.json({ import: imported }, { status: 201 });
  } catch (error) { return platformError(error); }
}
