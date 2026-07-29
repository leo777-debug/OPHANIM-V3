import { NextRequest, NextResponse } from 'next/server';
import { checkWatchlistProviders } from '@/lib/providers';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { WATCHLIST_TYPES, type WatchlistType } from '@/lib/watchlists/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (isRateLimited(getClientIp(request), 30, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  let body: { type?: string; value?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!WATCHLIST_TYPES.includes(body.type as WatchlistType) || typeof body.value !== 'string' || !body.value.trim() || body.value.length > 200) {
    return NextResponse.json({ error: 'Invalid watchlist item' }, { status: 400 });
  }
  try {
    const result = await checkWatchlistProviders({ type: body.type as WatchlistType, value: body.value }, { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Watchlist check failed' }, { status: 502 });
  }
}
