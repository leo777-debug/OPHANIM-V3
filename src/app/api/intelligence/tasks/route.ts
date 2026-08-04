import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { listOperationalTasks } from '@/lib/intelligence/operations';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try { return NextResponse.json({ tasks: await listOperationalTasks(await requireAuthenticatedActor(request, 'intelligence:read')) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Tasks unavailable.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); }
}
