'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HazardGroup } from '@/lib/intelligence/hazard-clustering';
import type { ProviderMapLayer } from '@/lib/providers/types';
import { safeSourceUrl } from '@/lib/intelligence/news';
const NativeMap = dynamic(() => import('@/components/OphanimMap'), { ssr: false });
const EMPTY = {}, EMPTY_LAYERS = { conflict_zones: false, sdk_sea: false, sdk_air: false, sdk_naval: false };
type Data = { groups: HazardGroup[]; diagnostics: Array<{ providerId: string; status: string; eventCount: number; message?: string }>; checkedAt: string | null; dataMode: string; staleSince: string | null; refresh: string; method: string; coverage: string; sources: Array<{ id: string; name: string; licence?: string; license?: string; commercialUse: string; attribution: string; rateLimits: string; keyNeeded: boolean; coverage?: string }> };
export default function HazardWorkspace() {
  const [data, setData] = useState<Data | null>(null), [kind, setKind] = useState('all'), [message, setMessage] = useState('');
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom: number; ts: number } | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const response = await fetch('/api/public-hazards', { signal, cache: 'no-store' }), result = await response.json(); if (!response.ok) throw new Error(result.error || 'Hazard observations unavailable.'); setData(result); setMessage(''); }
    catch (error) { if (!signal?.aborted) setMessage(error instanceof Error ? error.message : 'Hazard observations unavailable.'); }
  }, []);
  useEffect(() => { const abort = new AbortController(); void Promise.resolve().then(() => load(abort.signal)); const timer = setInterval(() => void load(abort.signal), 300000); return () => { abort.abort(); clearInterval(timer); }; }, [load]);
  const groups = useMemo(() => (data?.groups ?? []).filter(group => kind === 'all' || group.anchor.eventType === kind), [data, kind]);
  const layers = useMemo<ProviderMapLayer[]>(() => [{ id: 'public-hazard-groups', provider: 'ophanim-hazard-matching', name: 'Possible hazard groups', geometry: 'point', source: { type: 'FeatureCollection', features: groups.flatMap(group => typeof group.anchor.location.latitude === 'number' && typeof group.anchor.location.longitude === 'number' ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [group.anchor.location.longitude, group.anchor.location.latitude] }, properties: { title: group.anchor.title, recordCount: group.reports.length } }] : []) }, style: { color: '#fbbf24', radius: 5 }, visible: true, interactive: false }], [groups]);
  return <section className="platform-section"><h2>Natural hazards · possible duplicate reports</h2><p>{data?.coverage ?? 'Loading public hazard observations…'}</p><p>Possible groups are candidates for analyst review, not independent corroboration or verified impact. Reports remain accessible separately. Different publishers can repeat the same upstream observation.</p>
    <p>Source collection checked {data?.checkedAt ?? 'not completed'} · {data?.refresh ?? 'Periodic collection'} · {data?.dataMode === 'stale' ? `stale since ${data.staleSince ?? 'unknown'}` : data?.dataMode ?? 'not observed'}.</p>
    <label>Hazard type <select value={kind} onChange={event => setKind(event.target.value)}><option value="all">All hazard types</option>{['earthquake', 'wildfire', 'volcanic_activity', 'severe_storm', 'flood', 'drought', 'sea_ice'].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>{' '}<button type="button" onClick={() => void load()}>Refresh observations</button>
    {message && <p role="status">{message}</p>}<p>{groups.length} groups · {groups.reduce((sum, group) => sum + group.reports.length, 0)} source records. Missing coverage is not evidence of safety.</p>
    <p>Dense map points are grouped for display. Cluster numbers count plotted points, not independent incidents or corroborating sources. Select a cluster or zoom to reveal individual points.</p>
    <div style={{ height: 360, position: 'relative', overflow: 'hidden' }}><NativeMap data={EMPTY} activeLayers={EMPTY_LAYERS} providerLayers={layers} projection="mercator" initialView={{ latitude: 15, longitude: 0, zoom: 0.5 }} flyToLocation={flyTo} /></div>
    <details><summary>Matching method, sources and coverage gaps</summary><p>{data?.method}</p>{data?.diagnostics.map(item => <p key={item.providerId}>{item.providerId}: {item.status} · {item.eventCount} normalized observations · {item.message ?? ''}</p>)}{data?.sources.map(source => <p key={source.id}>{source.name}: {source.licence ?? source.license} · commercial use {source.commercialUse} · {source.attribution} · {source.rateLimits} · {source.coverage ?? 'Coverage unavailable while disabled'} · key {source.keyNeeded ? 'needed' : 'not needed'}</p>)}</details>
    {groups.map(group => <article key={group.id} className="platform-detail__block"><h3>{group.anchor.title}</h3><p>{group.matching} · {group.providers.length} source providers · {group.anchor.eventType.replaceAll('_', ' ')} · {group.anchor.startedAt ?? 'Observation date unknown'}</p>{group.ambiguity && <p>{group.ambiguity}</p>}
      {typeof group.anchor.location.latitude === 'number' && typeof group.anchor.location.longitude === 'number' && <button type="button" onClick={() => setFlyTo({ lat: group.anchor.location.latitude!, lng: group.anchor.location.longitude!, zoom: 6, ts: Date.now() })}>Locate reported point</button>}
      <details><summary>Every contributing source record · {group.reports.length}</summary>{group.reports.map(report => <div key={`${report.providerId}:${report.externalId}`}><h4>{report.title}</h4><p>{report.summary}</p><p>{report.providerId} · source time {report.startedAt ?? 'unknown'} · retrieved {report.sources[0]?.retrievedAt ?? 'unknown'}</p>{report.sources.map((source, index) => <p key={`${source.id}:${index}`}><a href={safeSourceUrl(source.url)} target="_blank" rel="noreferrer">{source.name}</a> · {source.sourceType} · {source.publishedAt ?? 'publication time unknown'}</p>)}</div>)}</details>
    </article>)}
  </section>;
}
