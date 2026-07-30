import { NextResponse } from 'next/server';
import { getProviderCatalog } from '@/lib/providers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const providers = getProviderCatalog();
  return NextResponse.json({
    providers,
    available: providers.filter((provider) => provider.enabled && provider.configured).length,
    total: providers.length,
    timestamp: new Date().toISOString(),
  });
}
