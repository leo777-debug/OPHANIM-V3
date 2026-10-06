'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

type Evidence = { id: string; title: string; evidence_type: string; verification_state: string; source_url: string | null; created_at: string };

export default function EvidencePanel() {
  const [items, setItems] = useState<Evidence[]>([]);
  const [title, setTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => { const response = await fetch('/api/platform/evidence', { cache: 'no-store' }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Evidence is unavailable.'); setItems(body.evidence ?? []); }, []);
  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);
  const submit = async (event: FormEvent) => { event.preventDefault(); try { const response = await fetch('/api/platform/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidenceType: 'source_record', title, sourceUrl: sourceUrl || undefined }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Unable to add evidence.'); setTitle(''); setSourceUrl(''); setMessage('Evidence recorded.'); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to add evidence.'); } };
  return <div className="platform-content"><section className="platform-section"><div className="platform-section__heading"><div><p>Traceable source material</p><h2>Evidence</h2></div></div><form className="platform-inline-form" onSubmit={(event) => void submit(event)}><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Evidence title" aria-label="Evidence title" /><input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Source URL (optional)" aria-label="Source URL" /><button type="submit" title="Record evidence"><Plus size={16} /> Record</button></form>{message && <p className="platform-notice">{message}</p>}<div className="platform-table"><div className="platform-table__head"><span>Evidence</span><span>Verification</span><span>Captured</span></div>{items.map((item) => <a key={item.id} href={item.source_url ?? '#'} target={item.source_url ? '_blank' : undefined} rel="noreferrer" className="platform-table__row"><strong>{item.title}</strong><span>{item.verification_state}</span><span>{new Date(item.created_at).toLocaleString()}</span></a>)}{!items.length && <p className="platform-empty">No evidence has been recorded.</p>}</div></section></div>;
}
