import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { platformError } from '@/lib/platform/http';
import { platformHealth } from '@/lib/platform/observability';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedActor(request, 'organization:manage');
    return NextResponse.json(await platformHealth());
  } catch (error) { return platformError(error); }
}
