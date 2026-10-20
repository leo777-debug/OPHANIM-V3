import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getAuthenticatedActor } from '@/lib/auth/actor';
import { sdkOrganizationId } from '@/lib/sdk/configuration';
export { sdkOrganizationId } from '@/lib/sdk/configuration';
const headers = { 'Cache-Control': 'private, no-store' };

export async function authorizeSdkRead(request: NextRequest): Promise<NextResponse | null> {
  const actor = await getAuthenticatedActor(request);
  if (!actor) return NextResponse.json({ error: 'Sign in to see your organization’s data.', returnTo: '/atlas' }, { status: 401, headers });
  const organizationId = sdkOrganizationId();
  if (!organizationId || !process.env.SDK_INGEST_KEY?.trim()) return NextResponse.json({ error: 'SDK service not configured. Add SDK settings in Admin → Integrations.' }, { status: 503, headers });
  if (actor.organizationId !== organizationId) return NextResponse.json({ error: 'This SDK feed belongs to another organization.' }, { status: 403, headers });
  return null;
}
