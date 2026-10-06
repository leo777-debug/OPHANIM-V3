import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { recordProductEvent } from '@/lib/platform/analytics';
import { requirePlatformCapability } from '@/lib/platform/capabilities';
import { createEvidence, listEvidence } from '@/lib/platform/evidence';
import { platformError } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:read');
    await requirePlatformCapability(actor, 'evidence');
    const params = new URL(request.url).searchParams;
    return NextResponse.json({ evidence: await listEvidence(actor, params.get('resourceType') ?? undefined, params.get('resourceId') ?? undefined) });
  } catch (error) { return platformError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:write');
    await requirePlatformCapability(actor, 'evidence');
    const evidence = await createEvidence(actor, await request.json());
    void recordProductEvent(actor, 'evidence.opened').catch(() => {});
    return NextResponse.json({ evidence }, { status: 201 });
  } catch (error) { return platformError(error); }
}
