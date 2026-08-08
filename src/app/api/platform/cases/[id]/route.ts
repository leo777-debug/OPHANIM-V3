import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { requirePlatformCapability } from '@/lib/platform/capabilities';
import { platformError } from '@/lib/platform/http';
import { getCase } from '@/lib/platform/workflows';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:read');
    await requirePlatformCapability(actor, 'workflows');
    const caseRecord = await getCase(actor, (await context.params).id);
    return caseRecord ? NextResponse.json({ case: caseRecord }) : NextResponse.json({ error: 'Case not found.' }, { status: 404 });
  } catch (error) { return platformError(error); }
}
