import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedActor } from '@/lib/auth/actor';

export async function GET(request: NextRequest) {
  const actor = await getAuthenticatedActor(request);
  return actor ? NextResponse.json({ actor }) : NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
}
