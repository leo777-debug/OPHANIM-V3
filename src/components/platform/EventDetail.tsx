'use client';

import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export default function EventDetail({ id }: { id: string }) {
  const [correlations, setCorrelations] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => { const response = await fetch(`/api/platform/events/${id}/correlations`, { cache: 'no-store' }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Correlations unavailable.'); setCorrelations(body.correlations ?? []); }, [id]);
  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);
  const correlate = async () => { try { const response = await fetch(`/api/platform/events/${id}/correlations`, { method: 'POST' }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Correlation failed.'); setCorrelations(body.correlations ?? []); setMessage('Deterministic correlation complete.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Correlation failed.'); } };
  return <div className="platform-content"><section className="platform-section"><div className="platform-section__heading"><div><p>Explainable matches</p><h2>Event correlations</h2></div><button type="button" onClick={() => void correlate()}><RefreshCw size={16} /> Correlate</button></div>{message && <p className="platform-notice">{message}</p>}{correlations.length ? <div className="platform-list">{correlations.map((item) => <article key={item.id ?? item.entityId} className="platform-row"><div><strong>{item.canonical_name ?? item.entityId}</strong><small>{item.explanation}</small></div><b>{item.confidence}/100</b></article>)}</div> : <p className="platform-empty">No deterministic correlations have been recorded for this event.</p>}</section></div>;
}
