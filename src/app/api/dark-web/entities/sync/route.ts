import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { synchronizeOperationalEntities } from '@/lib/dark-web/entity-registry';
import { reconcileIntelligence } from '@/lib/intelligence/operations';

export async function POST(request: NextRequest) { try { const actor = await requireAuthenticatedActor(request, 'intelligence:write'); return NextResponse.json({ synchronized: await synchronizeOperationalEntities(actor), reconciliation: await reconcileIntelligence(actor) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Entity synchronization failed.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); } }
