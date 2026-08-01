import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { createRescueCase, listRescueCases } from '@/lib/logistics/rescue';

function failure(error: unknown): NextResponse { return NextResponse.json({ error: error instanceof Error ? error.message : 'Rescue workflow request failed.' }, { status: error instanceof OrganizationAccessError ? 403 : 400 }); }
export async function GET(request: NextRequest) { try { return NextResponse.json({ cases: await listRescueCases(await requireAuthenticatedActor(request, 'rescue:read')) }); } catch (error) { return failure(error); } }
export async function POST(request: NextRequest) { try { return NextResponse.json({ rescueCase: await createRescueCase(await requireAuthenticatedActor(request, 'rescue:write'), await request.json()) }, { status: 201 }); } catch (error) { return failure(error); } }
