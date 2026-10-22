import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedActor } from '@/lib/auth/actor';
import { signInRequired } from '@/lib/auth/access-mode';

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const actor = await getAuthenticatedActor(request);
    return actor ? NextResponse.json({ actor, signInRequired: signInRequired() }, { headers }) : NextResponse.json({ error: 'Authentication is required.', signInRequired: true }, { status: 401, headers });
  } catch {
    return NextResponse.json({ error: 'Workspace storage is unavailable. Check DATABASE_URL and database migrations.', signInRequired: signInRequired() }, { status: 503, headers });
  }
}
