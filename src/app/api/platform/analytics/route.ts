import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { recordProductEvent } from '@/lib/platform/analytics';
import { platformError } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request);
    const body = await request.json() as { eventName?: unknown; metadata?: unknown };
    if (typeof body.eventName !== 'string') throw new Error('Event name is required.');
    await recordProductEvent(actor, body.eventName, body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {});
    return NextResponse.json({ accepted: true });
  } catch (error) { return platformError(error); }
}
