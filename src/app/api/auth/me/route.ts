import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedActor } from '@/lib/auth/actor';
import { signInRequired } from '@/lib/auth/access-mode';

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const actor = await getAuthenticatedActor(request);
    return actor ? NextResponse.json({ actor, signInRequired: signInRequired() }, { headers })
      : NextResponse.json({ error: 'Sign in to see your organization’s data.', signInRequired: true }, { status: 401, headers });
  } catch {
    return NextResponse.json({ error: 'Sign-in status is temporarily unavailable.', signInRequired: signInRequired() }, { status: 503, headers });
  }
}
