import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { startRemediationForSignal } from '@/lib/intelligence/operations';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return NextResponse.json(await startRemediationForSignal(await requireAuthenticatedActor(request, 'cyber:write'), id), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Remediation room could not start.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); }
}
