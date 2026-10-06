'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type CaseRecord = { id: string; title: string; case_status: string; priority: string; deadline_at: string | null; updated_at: string };

export default function CaseWorkspace() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('normal');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => { const response = await fetch('/api/platform/cases', { cache: 'no-store' }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Cases are unavailable.'); setCases(body.cases ?? []); }, []);
  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);
  const submit = async (event: FormEvent) => { event.preventDefault(); try { const response = await fetch('/api/platform/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, priority }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Unable to create case.'); setTitle(''); setMessage('Case created.'); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to create case.'); } };
  return <div className="platform-content"><section className="platform-section"><div className="platform-section__heading"><div><p>Configured workflows</p><h2>Cases</h2></div></div><form className="platform-inline-form" onSubmit={(event) => void submit(event)}><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Case title" aria-label="Case title" /><select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Case priority"><option value="low">Low priority</option><option value="normal">Normal priority</option><option value="high">High priority</option><option value="critical">Critical priority</option></select><button type="submit" title="Create case"><Plus size={16} /> Create case</button></form>{message && <p className="platform-notice">{message}</p>}<div className="platform-table"><div className="platform-table__head"><span>Case</span><span>Status</span><span>Priority</span></div>{cases.map((item) => <Link key={item.id} href={`/cases/${item.id}`} className="platform-table__row"><strong>{item.title}</strong><span>{item.case_status}</span><span className={`platform-priority-text platform-priority-text--${item.priority}`}>{item.priority}</span></Link>)}{!cases.length && <p className="platform-empty">No cases have been created.</p>}</div></section></div>;
}
