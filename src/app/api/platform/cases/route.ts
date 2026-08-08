import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { recordProductEvent } from '@/lib/platform/analytics';
import { requirePlatformCapability } from '@/lib/platform/capabilities';
import { platformError } from '@/lib/platform/http';
import { createCase, listCases } from '@/lib/platform/workflows';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:read');
    await requirePlatformCapability(actor, 'workflows');
    return NextResponse.json({ cases: await listCases(actor) });
  } catch (error) { return platformError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:write');
    await requirePlatformCapability(actor, 'workflows');
    const caseRecord = await createCase(actor, await request.json());
    void recordProductEvent(actor, 'case.created').catch(() => {});
    return NextResponse.json({ case: caseRecord }, { status: 201 });
  } catch (error) { return platformError(error); }
}
