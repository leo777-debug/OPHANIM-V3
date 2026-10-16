import { redirect } from 'next/navigation';
import { legacyAtlasDestination } from '@/lib/unified-map';

export default async function AtlasPage({ searchParams }: { searchParams:Promise<Record<string,string|string[]|undefined>> }) {
  redirect(legacyAtlasDestination(await searchParams));
}
