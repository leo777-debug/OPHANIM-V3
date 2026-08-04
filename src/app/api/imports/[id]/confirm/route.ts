import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { confirmImport } from '@/lib/imports/jobs';
import { ImportError } from '@/lib/imports/types';
import { OrganizationAccessError } from '@/lib/operations/authorization';

function isUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value); }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    if (!isUuid(id)) return NextResponse.json({ error: 'Import id is invalid.' }, { status: 400 });
    const confirmation = await confirmImport(await requireAuthenticatedActor(request, 'import:write'), id);
    return NextResponse.json(confirmation);
  } catch (error) {
    const status = error instanceof OrganizationAccessError ? 401 : error instanceof ImportError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import confirmation failed.' }, { status });
  }
}
