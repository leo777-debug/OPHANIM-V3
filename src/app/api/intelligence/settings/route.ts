import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { getIntelligenceNotificationSettings, updateIntelligenceNotificationSettings } from '@/lib/intelligence/operations';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try { return NextResponse.json({ settings: await getIntelligenceNotificationSettings(await requireAuthenticatedActor(request, 'intelligence:read')) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Notification settings unavailable.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); }
}

export async function PUT(request: NextRequest) {
  try { return NextResponse.json({ settings: await updateIntelligenceNotificationSettings(await requireAuthenticatedActor(request, 'intelligence:write'), await request.json()) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Notification settings update failed.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); }
}
