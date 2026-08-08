import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { platformError } from '@/lib/platform/http';
import { listSources, synchronizeSourceRegistry } from '@/lib/platform/sources';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedActor(request, 'intelligence:read');
    await synchronizeSourceRegistry();
    return NextResponse.json(await listSources());
  } catch (error) { return platformError(error); }
}
