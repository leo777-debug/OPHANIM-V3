import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { synchronizeOperationalEntities } from '@/lib/dark-web/entity-registry';

export async function POST(request: NextRequest) { try { return NextResponse.json({ synchronized: await synchronizeOperationalEntities(await requireAuthenticatedActor(request, 'intelligence:write')) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Entity synchronization failed.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); } }
