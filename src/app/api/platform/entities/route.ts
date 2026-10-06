import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { recordProductEvent } from '@/lib/platform/analytics';
import { requirePlatformCapability } from '@/lib/platform/capabilities';
import { createEntity, listEntities } from '@/lib/platform/entities';
import { platformError } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:read');
    await requirePlatformCapability(actor, 'entities');
    const search = new URL(request.url).searchParams.get('q') ?? undefined;
    return NextResponse.json({ entities: await listEntities(actor, search) });
  } catch (error) { return platformError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:write');
    await requirePlatformCapability(actor, 'entities');
    const entity = await createEntity(actor, await request.json());
    void recordProductEvent(actor, 'entity.viewed', { entityType: entity.entityType }).catch(() => {});
    return NextResponse.json({ entity }, { status: 201 });
  } catch (error) { return platformError(error); }
}
