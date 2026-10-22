import { NextRequest, NextResponse } from 'next/server';
import { collectIntelligenceEvents } from '@/lib/intelligence/event-provider-registry';
import { clusterHazards, HAZARD_MATCHING_METHOD } from '@/lib/intelligence/hazard-clustering';
import { GDACS_LICENCE } from '@/lib/intelligence/gdacs-provider';
import { ResilientFeed } from '@/lib/providers/resilient-feed';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
export const dynamic = 'force-dynamic';
const cache = new ResilientFeed<{ result: Awaited<ReturnType<typeof collectIntelligenceEvents>>; checkedAt: string }>({ ttlMs: 300000, timeoutMs: 12000, retries: 0 });
export async function GET(request: NextRequest) {
  if (isRateLimited(`public-hazards:${getClientIp(request)}`, 20)) return NextResponse.json({ error: 'Please retry later.' }, { status: 429 });
  const response = await cache.load('public-hazards', async () => ({ result: await collectIntelligenceEvents({ providerIds: ['usgs-earthquakes', 'nasa-eonet', 'gdacs-hazards'], limitPerProvider: 100 }), checkedAt: new Date().toISOString() }));
  const publicEvents = (response.data?.result.events ?? []).map(event => event.providerId === 'nasa-eonet' ? { ...event, summary: `Source-reported ${event.eventType.replaceAll('_', ' ')} listed by NASA EONET. Consult the linked original authority for details.`, attributes: { ...event.attributes, contentPolicy: 'Metadata only; third-party descriptions are not republished.' } } : event);
  const groups = clusterHazards(publicEvents);
  const dataMode = response.mode === 'stale' ? 'stale' : response.data?.result.diagnostics.some(item => item.status === 'success') ? 'recorded source responses' : 'unavailable';
  return NextResponse.json({ groups, diagnostics: response.data?.result.diagnostics ?? [], checkedAt: response.data?.checkedAt ?? null, requestedAt: new Date().toISOString(), dataMode, staleSince: response.staleSince, refresh: 'Every 300 s; GDACS normalized adapter disabled by licence', method: HAZARD_MATCHING_METHOD, coverage: 'Available USGS and NASA observations are incomplete global coverage. GDACS normalized events remain off until commercial reuse rights are established.', sources: [
    { id: 'usgs-earthquakes', name: 'USGS Earthquake Hazards', licence: 'US government public domain, USGS-authored event metadata', commercialUse: 'yes', attribution: 'US Geological Survey; no endorsement.', rateLimits: 'Application cache 300 seconds', keyNeeded: false, coverage: 'USGS magnitude 4.5+ past-day feed; smaller earthquakes and earlier events are outside this selection.' },
    { id: 'nasa-eonet', name: 'NASA EONET event metadata', licence: 'NASA-authored metadata; linked third-party materials retain their own rights', commercialUse: 'yes', attribution: 'NASA EONET and linked original observation authorities; third-party content is not relicensed.', rateLimits: 'Application cache 300 seconds', keyNeeded: false, coverage: 'Up to 100 open EONET events. Some are long-running; source retrieval time is not event onset time.' },
    { id: 'gdacs-hazards', name: 'GDACS', ...GDACS_LICENCE, keyNeeded: false, enabled: false },
  ] }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
}
