import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { getOrganizationConfiguration, updateOrganizationConfiguration } from '@/lib/platform/capabilities';
import { platformError } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try { return NextResponse.json({ configuration: await getOrganizationConfiguration(await requireAuthenticatedActor(request)) }); }
  catch (error) { return platformError(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'organization:manage');
    return NextResponse.json({ configuration: await updateOrganizationConfiguration(actor, await request.json()) });
  } catch (error) { return platformError(error); }
}
