import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { recordProductEvent } from '@/lib/platform/analytics';
import { requirePlatformCapability } from '@/lib/platform/capabilities';
import { platformError } from '@/lib/platform/http';
import { createCaseTask } from '@/lib/platform/workflows';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:write');
    await requirePlatformCapability(actor, 'workflows');
    const task = await createCaseTask(actor, (await context.params).id, await request.json());
    void recordProductEvent(actor, 'task.assigned').catch(() => {});
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) { return platformError(error); }
}
