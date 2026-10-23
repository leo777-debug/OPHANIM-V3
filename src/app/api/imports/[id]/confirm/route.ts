import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { confirmImport } from '@/lib/imports/jobs';
import { ImportError } from '@/lib/imports/types';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { importIdFrom } from '@/lib/imports/route-id';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = await importIdFrom(request, params);
    if (!id) return NextResponse.json({ error: 'Import id is invalid.' }, { status: 400 });
    const confirmation = await confirmImport(await requireAuthenticatedActor(request, 'import:write'), id);
    return NextResponse.json(confirmation);
  } catch (error) {
    const status = error instanceof OrganizationAccessError ? 401 : error instanceof ImportError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import confirmation failed.' }, { status });
  }
}
