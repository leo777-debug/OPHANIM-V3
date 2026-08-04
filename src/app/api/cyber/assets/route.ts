import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { createCyberAsset, listCyberAssets } from '@/lib/cyber/inventory';

function failure(error: unknown) { return NextResponse.json({ error: error instanceof OrganizationAccessError ? error.message : error instanceof Error ? error.message : 'Cyber asset request failed.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); }
export async function GET(request: NextRequest) { try { const customerId = new URL(request.url).searchParams.get('customerId') ?? undefined; return NextResponse.json({ assets: await listCyberAssets(await requireAuthenticatedActor(request, 'cyber:read'), customerId) }); } catch (error) { return failure(error); } }
export async function POST(request: NextRequest) { try { return NextResponse.json({ asset: await createCyberAsset(await requireAuthenticatedActor(request, 'cyber:write'), await request.json()) }, { status: 201 }); } catch (error) { return failure(error); } }
