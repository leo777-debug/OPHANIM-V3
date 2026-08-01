import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { syncExistingOphanimDisruptions } from '@/lib/logistics/disruption-ingestion';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'disruption:write');
    return NextResponse.json(await syncExistingOphanimDisruptions(new URL(request.url).origin, actor));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof OrganizationAccessError ? error.message : error instanceof Error ? error.message : 'Disruption sync failed.' },
      { status: error instanceof OrganizationAccessError ? 403 : 502 },
    );
  }
}
