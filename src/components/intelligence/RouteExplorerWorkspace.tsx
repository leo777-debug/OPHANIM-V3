'use client';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { ProviderMapLayer } from '@/lib/providers/types';
import type { exploreSeaRoute, Point } from '@/lib/route-intelligence/open-network';
import type { closureScenario, eventsAlongRoute } from '@/lib/route-intelligence/scenario';
const NativeMap = dynamic(() => import('@/components/OphanimMap'), { ssr: false });
type Port = { name: string; code: string; country: string; coordinates: Point };
type Result = Awaited<ReturnType<typeof exploreSeaRoute>> & { scenario: ReturnType<typeof closureScenario> | null; nearbyEvents: ReturnType<typeof eventsAlongRoute>; coverage: Array<{ providerId: string; status: string; message?: string }>; checkedAt: string };
const EMPTY_DATA = {};
const LAYERS = { conflict_zones: false, sdk_sea: false, sdk_air: false, sdk_naval: false };
const PASSAGES = [['ormuz', 'Hormuz'], ['babalmandab', 'Bab el-Mandeb'], ['suez', 'Suez'], ['malacca', 'Malacca'], ['panama', 'Panama'], ['gibraltar', 'Gibraltar'], ['bosporus', 'Bosporus'], ['south_africa', 'Cape']] as const;
function PortPicker({ label, onSelect }: { label: string; onSelect: (port: Port) => void }) {
  const [query, setQuery] = useState(''), [ports, setPorts] = useState<Port[]>([]), [error, setError] = useState('');
  const search = async () => { try { const response = await fetch(`/api/route-explorer?q=${encodeURIComponent(query)}`); const body = await response.json(); if (!response.ok) throw new Error(body.error); setPorts(body.ports); setError(''); } catch { setError('Port search unavailable. Enter at least two characters and retry.'); } };
  return <fieldset><legend>{label}</legend><label>Reference port <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Port name or UN/LOCODE" /></label><button type="button" onClick={() => void search()}>Search {label.toLowerCase()}</button>{error && <p role="status">{error}</p>}<ul>{ports.map(port => <li key={port.code}><button type="button" onClick={() => { onSelect(port); setQuery(`${port.name} (${port.code})`); setPorts([]); }}>{port.name} · {port.code} · {port.country}</button></li>)}</ul></fieldset>;
}
export default function RouteExplorerWorkspace() {
  const [origin, setOrigin] = useState<Port | null>(null), [destination, setDestination] = useState<Port | null>(null);
  const [closed, setClosed] = useState('suez'), [days, setDays] = useState(7), [speed, setSpeed] = useState(14), [includeEvents, setIncludeEvents] = useState(true);
  const [result, setResult] = useState<Result | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const calculate = async () => {
    if (!origin || !destination) { setError('Select two reference ports.'); return; } setLoading(true); setError('');
    try { const response = await fetch('/api/route-explorer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: origin.coordinates, destination: destination.coordinates, closed: closed ? [closed] : [], closedDays: days, speedKnots: speed, includeEvents }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setResult(body); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Route model unavailable.'); } finally { setLoading(false); }
  };
  const layers = useMemo<ProviderMapLayer[]>(() => result ? [result.baseline, result.alternative].flatMap((route, index) => !route ? [] : [{ id: `route-${index}`, provider: 'marnet-reference', name: index ? 'Hypothetical alternative' : 'Baseline model', geometry: 'line', source: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: route.coordinates }, properties: { label: index ? 'Alternative model' : 'Baseline model' } }] }, style: { color: index ? '#fbbf24' : '#22d3ee', width: 3 }, visible: true, interactive: false }]) : [], [result]);
  const bounds = useMemo<[Point, Point] | undefined>(() => {
    const points = [result?.baseline, result?.alternative].flatMap(route => route?.coordinates ?? []);
    if (!points.length) return;
    return [[Math.min(...points.map(point => point[0])), Math.max(-85, Math.min(...points.map(point => point[1])))], [Math.max(...points.map(point => point[0])), Math.min(85, Math.max(...points.map(point => point[1])))]];
  }, [result]);
  const csv = () => {
    if (!result) return; const cell = (value: unknown) => `"${String(value ?? '').replace(/^[\s]*[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const rows = [['model', 'origin', 'destination', 'sea_km', 'sea_days', 'closed_passage', 'closure_days', 'dataset_version'], ...[result.baseline, result.alternative].flatMap((route, index) => route ? [[index ? 'hypothetical_alternative' : 'baseline_model', origin?.code, destination?.code, route.distanceKm, route.days, result.closures.join(';'), days, result.dataset.version]] : [])];
    const url = URL.createObjectURL(new Blob([rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = 'ophanim-route-scenario.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="platform-content"><section className="platform-section"><h2>Route Explorer and closure scenario</h2><p>Pick two reference ports to model a sea path and hypothetical alternative. These are planning estimates, not navigational directions or live passage status.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 16 }}><PortPicker label="Origin" onSelect={setOrigin} /><PortPicker label="Destination" onSelect={setDestination} /></div>
    <p>{origin?.name ?? 'Origin not selected'} → {destination?.name ?? 'Destination not selected'}</p>
    <label>Hypothetical closure <select value={closed} onChange={event => setClosed(event.target.value)}><option value="">None</option>{PASSAGES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{' '}
    <label>Closure days <input type="number" min={1} max={365} value={days} onChange={event => setDays(Number(event.target.value))} /></label>{' '}
    <label>Speed in knots <input type="number" min={1} max={50} value={speed} onChange={event => setSpeed(Number(event.target.value))} /></label>{' '}
    <label><input type="checkbox" checked={includeEvents} onChange={event => setIncludeEvents(event.target.checked)} />Load public hazard context</label>{' '}
    <button type="button" disabled={loading} onClick={() => void calculate()}>{loading ? 'Calculating…' : 'Calculate model'}</button>
    {error && <p role="alert">{error}</p>}
    {result && <><h3>{result.label}</h3><p>Calculated {result.checkedAt} · reference network {result.dataset.version}, dataset {result.dataset.datasetDate}</p>
      <div style={{ height: 420, position: 'relative', overflow: 'hidden' }}><NativeMap data={EMPTY_DATA} activeLayers={LAYERS} providerLayers={layers} projection="mercator" fitBounds={bounds} initialView={{ longitude: origin?.coordinates[0] ?? 0, latitude: origin?.coordinates[1] ?? 20, zoom: 1.2 }} /></div>
      <table><thead><tr><th>Model</th><th>Sea distance</th><th>Sea time</th><th>Passages</th></tr></thead><tbody>{[result.baseline, result.alternative].map((route, index) => <tr key={index}><td>{index ? 'Alternative' : 'Baseline'}</td><td>{route ? `${route.distanceKm.toFixed(0)} km` : 'No connected path'}</td><td>{route ? `${route.days.toFixed(2)} days` : 'Unavailable'}</td><td>{route?.passages.map(passage => passage.name).join(', ') || 'None recorded'}</td></tr>)}</tbody></table>
      <p>Extra distance: {result.extraKm === null ? 'No alternative' : `${result.extraKm.toFixed(0)} km`} · extra sea time: {result.extraDays === null ? 'Unavailable' : `${result.extraDays.toFixed(2)} days`}</p>
      {result.scenario && <><h3>{result.scenario.label}</h3><p>{result.scenario.calculation}</p><p>Waiting: +{result.scenario.waitingExtraDays} days · reroute: {result.scenario.rerouteExtraDays === null ? 'unavailable' : `+${result.scenario.rerouteExtraDays.toFixed(2)} days`} · modeled minimum: +{result.scenario.modeledExtraDays.toFixed(2)} days.</p></>}
      <details><summary>Calculation, land connectors and provenance</summary><ul>{result.baseline?.assumptions.map(value => <li key={value}>{value}</li>)}</ul>{result.baseline?.connectors.map((connector, index) => <p key={index}>{index ? 'Destination' : 'Origin'} connector: {connector.distanceKm.toFixed(1)} km · {connector.mode}. No actual road or rail routing is included.</p>)}<p>{result.dataset.attribution}</p><a href={result.dataset.source} target="_blank" rel="noreferrer">Original network dataset</a> · <a href="/reference/MARNET-LICENSE.txt">Apache-2.0 licence</a></details>
      <details><summary>Public observations within 100 km of modeled path · {result.nearbyEvents.length}</summary>{result.coverage.map(item => <p key={item.providerId}>{item.providerId}: {item.status} {item.message}</p>)}{result.nearbyEvents.map(item => <p key={item.event.externalId}><a href={item.event.sources[0]?.url} target="_blank" rel="noreferrer">{item.event.title}</a> · {item.distanceKm.toFixed(0)} km · {item.event.startedAt ?? 'Date unknown'} · {item.label}</p>)}</details>
      <button type="button" onClick={csv}>Export CSV</button>{' '}<button type="button" onClick={() => window.print()}>Print / Save PDF</button>
    </>}
  </section></div>;
}
