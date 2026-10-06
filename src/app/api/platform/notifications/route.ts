import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { platformError } from '@/lib/platform/http';
import { listPlatformNotifications, queuePlatformNotification } from '@/lib/platform/notifications';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:read');
    return NextResponse.json({ notifications: await listPlatformNotifications(actor) });
  } catch (error) { return platformError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:write');
    return NextResponse.json({ notification: await queuePlatformNotification(actor, await request.json()) }, { status: 201 });
  } catch (error) { return platformError(error); }
}
