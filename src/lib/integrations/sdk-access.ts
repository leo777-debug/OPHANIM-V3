import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getAuthenticatedActor } from '@/lib/auth/actor';

/** The existing single-worker SDK store must be explicitly bound to one tenant. */
export function sdkOrganizationId(): string | null {
  const value = process.env.SDK_ORGANIZATION_ID?.trim();
  return value && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value) ? value : null;
}
export async function authorizeSdkRead(request: NextRequest): Promise<NextResponse | null> {
  const actor = await getAuthenticatedActor(request);
  if (!actor) return NextResponse.json({ error: 'Sign in to see your organization’s data.', returnTo: '/atlas' }, { status: 401 });
  const organizationId = sdkOrganizationId();
  if (!organizationId || !process.env.SDK_INGEST_KEY?.trim()) return NextResponse.json({ error: 'SDK service not configured. Add SDK settings in Admin → Integrations.' }, { status: 503 });
  if (actor.organizationId !== organizationId) return NextResponse.json({ error: 'This SDK feed belongs to another organization.' }, { status: 403 });
  return null;
}
