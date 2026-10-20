'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NormalizedIntelligenceEvent } from '@/lib/intelligence/event-provider';
import type { SpecialistSource } from '@/lib/intelligence/specialist-providers';
import { safeSourceUrl } from '@/lib/intelligence/news';
type ResponseData = { events: NormalizedIntelligenceEvent[]; diagnostics: Array<{ providerId: string; status: string; message?: string }>; sources: SpecialistSource[]; coverage: string; checkedAt: string };

export default function PublicIntelligenceWorkspace() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [country, setCountry] = useState(''); const [selectedCountry, setSelectedCountry] = useState('');
  const [kind, setKind] = useState('all'); const [query, setQuery] = useState(''); const [message, setMessage] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/public-intelligence${selectedCountry ? `?country=${encodeURIComponent(selectedCountry)}` : ''}`, { signal, cache: 'no-store' });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Public sources unavailable.');
      setData(body); setMessage('');
    } catch (error) { if (!signal?.aborted) setMessage(error instanceof Error ? error.message : 'Public sources unavailable.'); }
  }, [selectedCountry]);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); const timer = setInterval(() => void load(controller.signal), 300000); return () => { controller.abort(); clearInterval(timer); }; }, [load]);
  const events = useMemo(() => (data?.events ?? []).filter(event => (kind === 'all' || event.eventType === kind) && `${event.title} ${event.summary} ${event.location.label ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => (Date.parse(b.startedAt ?? '') || 0) - (Date.parse(a.startedAt ?? '') || 0)), [data, kind, query]);
  const exportCsv = () => {
    const cell = (value: unknown) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const csv = [['id', 'type', 'title', 'publication_time', 'retrieved_at', 'source', 'source_url', 'data_mode'], ...events.map(event => [event.externalId, event.eventType, event.title, event.startedAt, event.sources[0]?.retrievedAt, event.sources[0]?.name, event.sources[0]?.url, event.attributes.dataMode])].map(line => line.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'ophanim-public-advisories.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="platform-content"><section className="platform-section">
    <h2>Official warnings, health and travel</h2><p>{data?.coverage ?? 'Loading original official publications…'}</p>
    <p>Public awareness only. Read the current official notice before making safety or travel decisions. Original-language text is retained; no AI translation is applied. Map warnings are not a complete civil-defence siren service.</p>
    <form onSubmit={event => { event.preventDefault(); setSelectedCountry(country.trim().toLowerCase()); }} style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <label>Country travel advice slug <input value={country} onChange={event => setCountry(event.target.value)} placeholder="united-arab-emirates" pattern="[a-z][a-z-]{1,69}" /></label><button type="submit">Load country brief</button>
      <label>Search publications <input value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label>Type <select value={kind} onChange={event => setKind(event.target.value)}><option value="all">All types / timeline</option><option value="public_warning">Official public warnings</option><option value="cyclone_advisory">Cyclone advisories</option><option value="health_notice">Health notices</option><option value="travel_advisory">Country travel advice</option></select></label>
    </form>
    <button type="button" onClick={() => void load()}>Refresh</button> <button type="button" onClick={exportCsv}>Export filtered CSV</button>
    {message && <p role="status">{message}</p>}<p>{events.length} loaded publications · last request {data?.checkedAt ?? 'not completed'} · browser refresh every 300 s; individual sources cache at their stated cadence.</p>
    <details><summary>Coverage, source rights and gaps</summary>{data?.sources.map(source => {
      const diagnostic = data.diagnostics.find(item => item.providerId === source.id);
      return <article key={source.id}><h3>{source.name}</h3><p>{diagnostic?.status ?? (source.format === 'govuk' && !selectedCountry ? 'Select country' : 'Not checked')} {diagnostic?.message ?? ''}</p><p>{source.region} · {source.language} · {source.licence} · commercial use {source.commercialUse} · key {source.keyNeeded ? 'required' : 'not needed'}</p><p>{source.attribution}</p><p>{source.rateLimits}</p><a href={source.termsUrl} target="_blank" rel="noreferrer">Original source terms</a></article>;
    })}</details>
    {!events.length && data && <p>No matching publications are available. This can reflect source failure, a filter or no notices; it does not establish that the region is safe.</p>}
    <ol>{events.map(event => <li key={event.externalId} className="platform-detail__block">
      <h3><a href={safeSourceUrl(event.sources[0]?.url)} target="_blank" rel="noreferrer">{event.title}</a></h3>
      <p>{event.eventType.replaceAll('_', ' ')} · Official source · {String(event.attributes.originalLanguage ?? 'original language')} · {event.location.label ?? 'Reported coordinates'}</p>
      <p>Published: {event.startedAt ?? (event.attributes.publicationAnomaly ? 'Source timestamp requires review' : 'Not provided')} · fetched: {event.sources[0]?.retrievedAt ?? 'Not recorded'}</p>
      {event.attributes.publicationAnomaly ? <p role="status">{String(event.attributes.publicationAnomaly)} Reported timestamp: {String(event.attributes.reportedPublishedAt)}</p> : null}
      <p>{event.attributes.dataMode === 'stale' ? `Stale since ${String(event.attributes.staleSince ?? 'unknown')}` : 'Recorded source response'} · every {String(event.attributes.intervalSeconds ?? 'unknown')} seconds</p>
      <p>{event.summary}</p><p>{String(event.attributes.severityMethod ?? '')}</p><p>{String(event.attributes.attribution ?? event.sources[0]?.name ?? '')}</p>
    </li>)}</ol>
  </section></div>;
}
