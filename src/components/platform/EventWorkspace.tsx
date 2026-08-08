'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type EventRecord = { id: string; title: string; eventType: string; status: string; severity: number | null; updatedAt: string };

export default function EventWorkspace() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('operational_event');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => { const response = await fetch('/api/platform/events', { cache: 'no-store' }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Events are unavailable.'); setEvents(body.events ?? []); }, []);
  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);
  const submit = async (event: FormEvent) => { event.preventDefault(); try { const response = await fetch('/api/platform/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventType, title }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Unable to record event.'); setTitle(''); setMessage('Event recorded.'); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to record event.'); } };
  return <div className="platform-content"><section className="platform-section"><div className="platform-section__heading"><div><p>Normalized operational signals</p><h2>Events</h2></div></div><form className="platform-inline-form" onSubmit={(event) => void submit(event)}><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Event title" aria-label="Event title" /><input value={eventType} onChange={(event) => setEventType(event.target.value)} placeholder="Event type" aria-label="Event type" /><button type="submit"><Plus size={16} /> Record event</button></form>{message && <p className="platform-notice">{message}</p>}<div className="platform-table"><div className="platform-table__head"><span>Event</span><span>Status</span><span>Severity</span></div>{events.map((item) => <Link key={item.id} href={`/events/${item.id}`} className="platform-table__row"><strong>{item.title}<small>{item.eventType}</small></strong><span>{item.status}</span><span>{item.severity ?? 'Unscored'}</span></Link>)}{!events.length && <p className="platform-empty">No events have been recorded.</p>}</div></section></div>;
}
