'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { assessShipmentScenario, Scenario } from '@/lib/route-intelligence/scenarios';
type Result = Awaited<ReturnType<typeof assessShipmentScenario>>;
export default function ScenarioExposurePanel() {
  const [type, setType] = useState<Scenario['type']>('chokepoint_closed'), [days, setDays] = useState(7), [passage, setPassage] = useState('suez'), [port, setPort] = useState('AEJEA'), [country, setCountry] = useState('United Arab Emirates');
  const [longitude, setLongitude] = useState(56), [latitude, setLatitude] = useState(25), [radius, setRadius] = useState(100);
  const [result, setResult] = useState<Result | null>(null), [message, setMessage] = useState(''), [pending, setPending] = useState(false);
  const run = async () => {
    const scenario = type === 'chokepoint_closed' ? { type, days, passage } : type === 'port_closed' ? { type, days, port } : type === 'sanctions_country' ? { type, days, country } : { type, days, center: [longitude, latitude], radiusKm: radius };
    setPending(true); setMessage(''); setResult(null);
    try { const response = await fetch('/api/scenario-exposure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scenario) }); const body = await response.json(); if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Sign in to see your organization’s data.' : body.error || 'Scenario unavailable.'); setResult(body); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Scenario unavailable.'); } finally { setPending(false); }
  };
  const exportCsv = () => {
    if (!result) return; const cell = (value: unknown) => `"${String(value ?? '').replace(/^[\s]*[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const rows = [['shipment_id', 'reference', 'assessment', 'modeled_extra_days', 'recorded_ports', 'model_inputs'], ...result.reports.map(report => [report.shipmentId, report.reference, report.assessment, 'modeledExtraDays' in report ? report.modeledExtraDays : null, 'recordedPorts' in report ? report.recordedPorts?.join(';') : '', JSON.stringify(result.scenario)])];
    const url = URL.createObjectURL(new Blob([rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'ophanim-organization-scenario.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="platform-section" aria-label="Organization scenario engine"><h2>Organization scenario engine</h2><p>Hypothetical operational exposure for your organization’s recorded shipment routes. This creates no real disruption, sanctions finding or validated forecast. Sign-in is required.</p>
    <label>Template <select value={type} onChange={event => setType(event.target.value as Scenario['type'])}><option value="chokepoint_closed">Chokepoint closed N days</option><option value="port_closed">Port closed</option><option value="sanctions_country">Sanctions on a country</option><option value="severe_weather">Severe weather over an area</option></select></label>{' '}
    <label>Duration, days <input type="number" min={1} max={365} value={days} onChange={event => setDays(Number(event.target.value))} /></label>{' '}
    {type === 'chokepoint_closed' && <label>Passage <select value={passage} onChange={event => setPassage(event.target.value)}>{[['suez', 'Suez'], ['ormuz', 'Hormuz'], ['babalmandab', 'Bab el-Mandeb'], ['malacca', 'Malacca'], ['panama', 'Panama'], ['gibraltar', 'Gibraltar'], ['bosporus', 'Bosporus'], ['south_africa', 'Cape']].map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>}
    {type === 'port_closed' && <label>Port UN/LOCODE <input value={port} onChange={event => setPort(event.target.value)} /></label>}
    {type === 'sanctions_country' && <label>Country name in reference dataset <input value={country} onChange={event => setCountry(event.target.value)} /></label>}
    {type === 'severe_weather' && <><label>Longitude <input type="number" min={-180} max={180} value={longitude} onChange={event => setLongitude(Number(event.target.value))} /></label><label>Latitude <input type="number" min={-90} max={90} value={latitude} onChange={event => setLatitude(Number(event.target.value))} /></label><label>Radius, km <input type="number" min={1} max={1000} value={radius} onChange={event => setRadius(Number(event.target.value))} /></label></>}
    <button type="button" disabled={pending} onClick={() => void run()}>{pending ? 'Evaluating recorded routes…' : 'Evaluate organization exposure'}</button>
    {message && <p role="status">{message} <Link href="/login?returnTo=%2Froute-explorer">Sign in</Link></p>}
    {result && <><h3>{result.label}</h3><p>Calculated inputs: {JSON.stringify(result.scenario)}</p><p>{result.calculation}</p><p>{result.limitation}</p><p>{result.assessedRecords} assessed / {result.totalRecords} records · {result.unassessedRecords} unassessed. Reference dataset {result.dataset.version}, {result.dataset.datasetDate}.</p>
      <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Shipment</th><th>Model assessment</th><th>Modeled extra days</th><th>Evidence / gap</th></tr></thead><tbody>{result.reports.map(report => <tr key={report.shipmentId}><td>{report.reference}</td><td>{report.assessment}</td><td>{'modeledExtraDays' in report && report.modeledExtraDays !== null ? report.modeledExtraDays?.toFixed(2) : 'Unknown / no modeled exposure'}</td><td>{'reason' in report ? report.reason : report.recordedPorts?.join(' → ')}</td></tr>)}</tbody></table></div>
      <button type="button" onClick={exportCsv}>Export private CSV</button>{' '}<button type="button" onClick={() => window.print()}>Print / Save PDF</button>
    </>}
  </section>;
}
