import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { getRescueCase, updateRescueCaseStatus } from '@/lib/logistics/rescue';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function failure(error: unknown): NextResponse { return NextResponse.json({ error: error instanceof Error ? error.message : 'Rescue case request failed.' }, { status: error instanceof OrganizationAccessError ? 403 : 400 }); }
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params; if (!UUID.test(id)) return NextResponse.json({ error: 'Rescue case ID is invalid.' }, { status: 400 }); const rescueCase = await getRescueCase(await requireAuthenticatedActor(request, 'rescue:read'), id); return rescueCase ? NextResponse.json({ rescueCase }) : NextResponse.json({ error: 'Rescue case not found.' }, { status: 404 }); } catch (error) { return failure(error); } }
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params; if (!UUID.test(id)) return NextResponse.json({ error: 'Rescue case ID is invalid.' }, { status: 400 }); const rescueCase = await updateRescueCaseStatus(await requireAuthenticatedActor(request, 'rescue:write'), id, await request.json()); return rescueCase ? NextResponse.json({ rescueCase }) : NextResponse.json({ error: 'Rescue case not found.' }, { status: 404 }); } catch (error) { return failure(error); } }
