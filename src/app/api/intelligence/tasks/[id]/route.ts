import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { updateOperationalTask } from '@/lib/intelligence/operations';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return NextResponse.json(await updateOperationalTask(await requireAuthenticatedActor(request, 'intelligence:write'), id, await request.json())); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Task update failed.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); }
}
