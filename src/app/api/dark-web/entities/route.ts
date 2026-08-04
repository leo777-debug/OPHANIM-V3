import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { findRegisteredEntities, registerEntity } from '@/lib/dark-web/entity-registry';

function failure(error: unknown) { return NextResponse.json({ error: error instanceof OrganizationAccessError ? error.message : error instanceof Error ? error.message : 'Entity request failed.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); }
export async function GET(request: NextRequest) { try { return NextResponse.json({ entities: await findRegisteredEntities(await requireAuthenticatedActor(request, 'intelligence:read')) }); } catch (error) { return failure(error); } }
export async function POST(request: NextRequest) { try { return NextResponse.json({ entity: await registerEntity(await requireAuthenticatedActor(request, 'intelligence:write'), await request.json()) }, { status: 201 }); } catch (error) { return failure(error); } }
