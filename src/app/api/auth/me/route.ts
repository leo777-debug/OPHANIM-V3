import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedActor } from '@/lib/auth/actor';

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const actor = await getAuthenticatedActor(request);
    return actor ? NextResponse.json({ actor }, { headers })
      : NextResponse.json({ error: 'Sign in to see your organization’s data.' }, { status: 401, headers });
  } catch {
    return NextResponse.json({ error: 'Sign-in status is temporarily unavailable.' }, { status: 503, headers });
  }
}
