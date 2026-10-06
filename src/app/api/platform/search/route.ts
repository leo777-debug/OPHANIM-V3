import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { platformError } from '@/lib/platform/http';
import { searchPlatform } from '@/lib/platform/search';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:read');
    const query = new URL(request.url).searchParams.get('q') ?? '';
    return NextResponse.json(await searchPlatform(actor, query, request.headers.get('accept-language')?.split(',')[0] ?? 'en'));
  } catch (error) { return platformError(error); }
}
