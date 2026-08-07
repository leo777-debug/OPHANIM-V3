import { NextResponse } from 'next/server';
import { getProviderCatalog } from '@/lib/providers';
import { getProductionSourceCatalog } from '@/lib/providers/source-governance';

export const dynamic = 'force-dynamic';

export async function GET() {
  const providers = getProviderCatalog();
  const productionSources = getProductionSourceCatalog();
  return NextResponse.json({
    providers,
    productionSources,
    available: providers.filter((provider) => provider.enabled && provider.configured).length,
    total: providers.length,
    timestamp: new Date().toISOString(),
  });
}
