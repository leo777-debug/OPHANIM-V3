import { NextResponse } from 'next/server';
import { intelligenceEventProviderRegistry } from '@/lib/intelligence/event-provider-registry';
export const dynamic = 'force-dynamic';
export function GET() {
  return NextResponse.json({ providers: intelligenceEventProviderRegistry.catalog().filter((provider) => provider.id.startsWith('verify-')) }, { headers: { 'Cache-Control': 'no-store' } });
}
