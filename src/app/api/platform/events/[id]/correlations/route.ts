import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { requirePlatformCapability } from '@/lib/platform/capabilities';
import { correlateEvent, listEventCorrelations } from '@/lib/platform/correlation';
import { platformError } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:read');
    await requirePlatformCapability(actor, 'events');
    return NextResponse.json({ correlations: await listEventCorrelations(actor, (await context.params).id) });
  } catch (error) { return platformError(error); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:write');
    await requirePlatformCapability(actor, 'events');
    return NextResponse.json({ correlations: await correlateEvent(actor, (await context.params).id) });
  } catch (error) { return platformError(error); }
}
