import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { requirePlatformCapability } from '@/lib/platform/capabilities';
import { createEvent, listEvents } from '@/lib/platform/events';
import { platformError } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:read');
    await requirePlatformCapability(actor, 'events');
    return NextResponse.json({ events: await listEvents(actor, new URL(request.url).searchParams.get('q') ?? undefined) });
  } catch (error) { return platformError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:write');
    await requirePlatformCapability(actor, 'events');
    return NextResponse.json({ event: await createEvent(actor, await request.json()) }, { status: 201 });
  } catch (error) { return platformError(error); }
}
