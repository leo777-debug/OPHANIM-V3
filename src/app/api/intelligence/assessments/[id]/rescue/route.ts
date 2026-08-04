import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { startRescueForSignal } from '@/lib/intelligence/operations';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return NextResponse.json({ rescueCase: await startRescueForSignal(await requireAuthenticatedActor(request, 'rescue:write'), id) }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Rescue workflow could not start.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); }
}
