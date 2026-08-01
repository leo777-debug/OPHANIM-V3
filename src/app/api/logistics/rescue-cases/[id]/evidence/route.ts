import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { addRescueEvidence } from '@/lib/logistics/rescue';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params; if (!UUID.test(id)) return NextResponse.json({ error: 'Rescue case ID is invalid.' }, { status: 400 }); return NextResponse.json({ evidence: await addRescueEvidence(await requireAuthenticatedActor(request, 'rescue:write'), id, await request.json()) }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Rescue evidence failed.' }, { status: error instanceof OrganizationAccessError ? 403 : 400 }); } }
