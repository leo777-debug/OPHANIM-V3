'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Clock3, Database, ListChecks, Radio } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ProviderHealthPanel from './ProviderHealthPanel';

type CaseRecord = { id: string; title: string; case_status: string; priority: string; deadline_at: string | null };
type EventRecord = { id: string; title: string; event_type: string; severity: number | null; updatedAt?: string };
type EntityRecord = { id: string; canonicalName: string; entityType: string };

export default function CommandDashboard() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const [caseResponse, eventResponse, entityResponse] = await Promise.all([fetch('/api/platform/cases', { cache: 'no-store' }), fetch('/api/platform/events', { cache: 'no-store' }), fetch('/api/platform/entities', { cache: 'no-store' })]);
      if (!caseResponse.ok || !eventResponse.ok || !entityResponse.ok) throw new Error('Sign in to load your configured workspace.');
      setCases((await caseResponse.json()).cases ?? []);
      setEvents((await eventResponse.json()).events ?? []);
      setEntities((await entityResponse.json()).entities ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Workspace is unavailable.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const actionable = useMemo(() => cases.filter((item) => !['Closed', 'Resolved', 'Cancelled'].includes(item.case_status)), [cases]);
  const overdue = useMemo(() => actionable.filter((item) => item.deadline_at && Date.parse(item.deadline_at) < Date.now()), [actionable]);
  return <div className="platform-content"><div className="platform-summary"><Metric icon={ListChecks} label="Cases needing attention" value={actionable.length} /><Metric icon={Clock3} label="Overdue deadlines" value={overdue.length} tone="danger" /><Metric icon={Radio} label="Recent events" value={events.length} /><Metric icon={Database} label="Monitored entities" value={entities.length} /></div>{error && <div className="platform-notice">{error} <Link href="/login">Sign in</Link></div>}<div className="platform-grid"><section className="platform-section"><div className="platform-section__heading"><div><p>Priority queue</p><h2>What needs attention</h2></div><Link href="/cases">View cases <ArrowRight size={15} /></Link></div>{actionable.length ? <div className="platform-list">{actionable.slice(0, 8).map((item) => <Link key={item.id} href={`/cases/${item.id}`} className="platform-row"><span className={`platform-priority platform-priority--${item.priority}`} /><div><strong>{item.title}</strong><small>{item.case_status}{item.deadline_at ? ` · Due ${new Date(item.deadline_at).toLocaleString()}` : ''}</small></div><ArrowRight size={16} /></Link>)}</div> : <Empty label="No active cases. Create one from an entity or event when follow-up work is needed." />}</section><section className="platform-section"><div className="platform-section__heading"><div><p>Incoming signals</p><h2>Recent events</h2></div><Link href="/events">View events <ArrowRight size={15} /></Link></div>{events.length ? <div className="platform-list">{events.slice(0, 8).map((item) => <Link key={item.id} href={`/events/${item.id}`} className="platform-row"><AlertTriangle size={16} /><div><strong>{item.title}</strong><small>{item.event_type}{item.severity !== null ? ` · Severity ${item.severity}` : ''}</small></div><ArrowRight size={16} /></Link>)}</div> : <Empty label="No platform events have been recorded yet." />}</section></div><ProviderHealthPanel /></div>;
}

function Metric({ icon: Icon, label, value, tone = 'normal' }: { icon: typeof Radio; label: string; value: number; tone?: 'normal' | 'danger' }) { return <section className={`platform-metric${tone === 'danger' ? ' is-danger' : ''}`}><Icon size={18} /><span>{label}</span><strong>{value}</strong></section>; }
function Empty({ label }: { label: string }) { return <p className="platform-empty">{label}</p>; }
