'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';

export default function VerticalGenerator() {
  const [vertical, setVertical] = useState('general');
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({ map: true, search: true, workflows: true, entities: true, events: true, evidence: true, imports: true, watchlists: true });
  const [message, setMessage] = useState('');
  useEffect(() => { void fetch('/api/platform/configuration', { cache: 'no-store' }).then(async (response) => response.ok ? response.json() : null).then((body) => { if (body?.configuration) { setVertical(body.configuration.vertical); setCapabilities(body.configuration.capabilities); } }); }, []);
  const save = async (event: FormEvent) => { event.preventDefault(); try { const response = await fetch('/api/platform/configuration', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vertical, capabilities }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Unable to save configuration.'); setMessage('Organization configuration saved. Navigation and backend capability enforcement now use this configuration.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save configuration.'); } };
  return <div className="platform-content"><section className="platform-section"><div className="platform-section__heading"><div><p>Administrator configuration</p><h2>Vertical generator</h2></div></div><form className="platform-vertical" onSubmit={(event) => void save(event)}><label>Vertical<input value={vertical} onChange={(event) => setVertical(event.target.value)} /></label><div className="platform-capability-grid">{Object.entries(capabilities).sort(([left], [right]) => left.localeCompare(right)).map(([name, enabled]) => <label key={name}><input type="checkbox" checked={enabled} onChange={(event) => setCapabilities((current) => ({ ...current, [name]: event.target.checked }))} />{name.replaceAll('_', ' ')}</label>)}</div><button type="submit"><Settings2 size={16} /> Save configuration</button></form>{message && <p className="platform-notice">{message}</p>}</section></div>;
}
