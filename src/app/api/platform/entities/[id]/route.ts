import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { recordProductEvent } from '@/lib/platform/analytics';
import { requirePlatformCapability } from '@/lib/platform/capabilities';
import { getEntity } from '@/lib/platform/entities';
import { platformError } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:read');
    await requirePlatformCapability(actor, 'entities');
    const entity = await getEntity(actor, (await context.params).id);
    if (!entity) return NextResponse.json({ error: 'Entity not found.' }, { status: 404 });
    void recordProductEvent(actor, 'entity.viewed', { entityType: entity.entityType }).catch(() => {});
    return NextResponse.json({ entity });
  } catch (error) { return platformError(error); }
}
