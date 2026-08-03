import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { getFeatureFlags } from '@/lib/operations/feature-flags';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedActor(request);
    return NextResponse.json(getFeatureFlags());
  } catch (error) {
    const status = error instanceof OrganizationAccessError ? 401 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Feature configuration unavailable' }, { status });
  }
}
