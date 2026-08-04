import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { reconcileIntelligence } from '@/lib/intelligence/operations';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await reconcileIntelligence(await requireAuthenticatedActor(request, 'intelligence:write'))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Intelligence reconciliation failed.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); }
}
