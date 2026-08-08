'use client';

import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type Entity = { id: string; canonicalName: string; entityType: string; updatedAt: string };

export default function EntityWorkspace() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [query, setQuery] = useState('');
  const [entityType, setEntityType] = useState('organization');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async (term = '') => { const response = await fetch(`/api/platform/entities${term ? `?q=${encodeURIComponent(term)}` : ''}`, { cache: 'no-store' }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Entities are unavailable.'); setEntities(body.entities ?? []); }, []);
  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);
  const submit = async (event: FormEvent) => { event.preventDefault(); try { const response = await fetch('/api/platform/entities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityType, canonicalName: name }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Unable to create entity.'); setName(''); setMessage('Entity saved.'); await load(query); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to create entity.'); } };
  return <div className="platform-content"><section className="platform-section"><div className="platform-section__heading"><div><p>Private and source-backed records</p><h2>Entities</h2></div></div><form className="platform-inline-form" onSubmit={(event) => void submit(event)}><select value={entityType} onChange={(event) => setEntityType(event.target.value)} aria-label="Entity type"><option>organization</option><option>company</option><option>person</option><option>domain</option><option>ip</option><option>vessel</option><option>port</option><option>aircraft</option><option>facility</option><option>asset</option><option>supplier</option><option>product</option><option>custom</option></select><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Canonical name" aria-label="Canonical name" /><button type="submit" title="Create entity"><Plus size={16} /> Create</button></form><div className="platform-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(query).catch((error) => setMessage(error.message)); }} placeholder="Search entities" /><button type="button" onClick={() => void load(query).catch((error) => setMessage(error.message))}>Search</button></div>{message && <p className="platform-notice">{message}</p>}<div className="platform-table"><div className="platform-table__head"><span>Name</span><span>Type</span><span>Updated</span></div>{entities.map((entity) => <Link key={entity.id} href={`/entities/record/${entity.id}`} className="platform-table__row"><strong>{entity.canonicalName}</strong><span>{entity.entityType}</span><span>{new Date(entity.updatedAt).toLocaleString()}</span></Link>)}{!entities.length && <p className="platform-empty">No matching entities.</p>}</div></section></div>;
}
