import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { listIntelligenceDeliveryLogs } from '@/lib/intelligence/operations';
import { isSchemaPendingError } from '@/lib/db/schema-pending';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try { return NextResponse.json({ deliveries: await listIntelligenceDeliveryLogs(await requireAuthenticatedActor(request, 'intelligence:read')) }); }
  catch (error) {
    if (isSchemaPendingError(error)) return NextResponse.json({ deliveries: [], setupPending: true });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Delivery log unavailable.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 });
  }
}
