import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { createCyberClient, listCyberClients } from '@/lib/cyber/inventory';

function failure(error: unknown) { return NextResponse.json({ error: error instanceof OrganizationAccessError ? error.message : error instanceof Error ? error.message : 'Cyber client request failed.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); }
export async function GET(request: NextRequest) { try { return NextResponse.json({ clients: await listCyberClients(await requireAuthenticatedActor(request, 'cyber:read')) }); } catch (error) { return failure(error); } }
export async function POST(request: NextRequest) { try { return NextResponse.json({ client: await createCyberClient(await requireAuthenticatedActor(request, 'cyber:write'), await request.json()) }, { status: 201 }); } catch (error) { return failure(error); } }
