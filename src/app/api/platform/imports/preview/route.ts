import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { createEntityImport } from '@/lib/imports/generic-entity-import';
import { requirePlatformCapability } from '@/lib/platform/capabilities';
import { platformError } from '@/lib/platform/http';
import { importPreviewLimited } from '@/lib/imports/intake';
import { limitedFormData,RequestBodyLimitError } from '@/lib/http/limited-form-data';
import { MAX_IMPORT_BYTES } from '@/lib/imports/csv';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'import:write');
    if(importPreviewLimited(request,actor))return NextResponse.json({error:'Too many import previews. Wait a moment and try again.'},{status:429});
    await requirePlatformCapability(actor, 'imports');
    const form = await limitedFormData(request,MAX_IMPORT_BYTES+256*1024);
    const file = form.get('file');
    const entityType = form.get('entityType');
    const mapping = form.get('mapping');
    if (!(file instanceof File)) throw new Error('A CSV file is required.');
    if(file.size>MAX_IMPORT_BYTES)return NextResponse.json({error:'The file exceeds the 5 MB limit.'},{status:413});
    if (typeof entityType !== 'string' || typeof mapping !== 'string') throw new Error('Entity type and mapping are required.');
    const imported = await createEntityImport(actor, file.name, new Uint8Array(await file.arrayBuffer()), entityType, JSON.parse(mapping));
    return NextResponse.json({ import: imported }, { status: 201 });
  } catch (error) { return error instanceof RequestBodyLimitError ? NextResponse.json({error:'Import request is too large.'},{status:413}) : platformError(error); }
}
