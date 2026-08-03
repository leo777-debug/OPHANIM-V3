import { NextRequest, NextResponse } from 'next/server';
import { createWatchlist, listWatchlists } from '@/lib/watchlists/service';

const owner = (request: NextRequest) => request.cookies.get('ophanim_watchlist_owner')?.value || crypto.randomUUID();

const response = (data: unknown, ownerId: string, status = 200) => {
  const result = NextResponse.json(data, { status });
  result.cookies.set('ophanim_watchlist_owner', ownerId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 31536000,
    path: '/',
  });
  return result;
};

export async function GET(request: NextRequest) {
  const ownerId = owner(request);

  try {
    return response({ watchlists: await listWatchlists(ownerId) }, ownerId);
  } catch {
    return response({ error: 'Watchlists are temporarily unavailable.' }, ownerId, 503);
  }
}

export async function POST(request: NextRequest) {
  const ownerId = owner(request);

  try {
    return response({ watchlist: await createWatchlist(ownerId, await request.json()) }, ownerId, 201);
  } catch (error) {
    return response(
      { error: error instanceof Error ? error.message : 'Invalid watchlist item.' },
      ownerId,
      400,
    );
  }
}
