'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Forecast } from '@/lib/intelligence/forecasts';

export default function ForecastWorkspace() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]), [message, setMessage] = useState(''), [protectedView, setProtectedView] = useState(false), [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState(''), [horizon, setHorizon] = useState(''), [probability, setProbability] = useState(50), [sourceUrl, setSourceUrl] = useState(''), [rationale, setRationale] = useState('');
  const [outcomeSources, setOutcomeSources] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false), [writable, setWritable] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/forecasts', { signal, cache: 'no-store' }), body = await response.json();
      if (!response.ok) { setProtectedView(response.status === 401 || response.status === 403); throw new Error(body.error || 'Forecasts unavailable.'); }
      setForecasts(body.forecasts); setWritable(body.writable === true); setProtectedView(false); setMessage('');
    } catch (error) { if (!signal?.aborted) setMessage(error instanceof Error ? error.message : 'Forecasts unavailable.'); }
    finally { if (!signal?.aborted) setLoaded(true); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); return () => controller.abort(); }, [load]);
  const mutate = async (method: 'POST' | 'PATCH', body: unknown) => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/forecasts', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) { setProtectedView(response.status === 401 || response.status === 403); throw new Error(result.error || 'Forecast update failed.'); }
      await load(); if (method === 'POST') { setQuestion(''); setRationale(''); setSourceUrl(''); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Forecast update failed.'); } finally { setBusy(false); }
  };
  return <section className="platform-section"><h2>Sourced forecasts — probabilities, not facts</h2>
    <p>Record a public operational question, an analyst-entered probability, evidence link and horizon before the outcome. Linked evidence supplies context; no source probability or validated predictive accuracy is implied. Use public disruption, safety and route-risk questions.</p>
    <p>After the horizon passes, record a sourced yes/no outcome. Binary Brier score = (probability − outcome)², where yes = 1 and no = 0. Lower is better; unresolved questions are unscored. Original probabilities cannot be edited after recording.</p>
    {message && <p role="status">{message}</p>}{protectedView && <p><Link href="/login?returnTo=%2Fforecasts">Sign in to see your organization’s data</Link></p>}
    {!loaded && <p role="status">Loading your organization’s forecast records…</p>}
    {loaded && !protectedView && !writable && !message && <p>Read-only access. An analyst or organization manager can record probabilities and outcomes.</p>}
    {loaded && !protectedView && writable && <form onSubmit={event => { event.preventDefault(); if (horizon) void mutate('POST', { question, horizon: new Date(horizon).toISOString(), probability: probability / 100, sourceUrl, rationale }); }}>
      <p><label>Question <input required minLength={10} maxLength={500} value={question} onChange={event => setQuestion(event.target.value)} /></label></p>
      <p><label>Horizon (your local time) <input required type="datetime-local" value={horizon} onChange={event => setHorizon(event.target.value)} /></label>{' '}<label>Probability, % <input type="number" required min={0} max={100} step={0.01} value={probability} onChange={event => setProbability(Number(event.target.value))} /></label></p>
      <p><label>Public evidence URL <input required type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://…" /></label></p>
      <p><label>Analyst rationale <textarea maxLength={4000} value={rationale} onChange={event => setRationale(event.target.value)} /></label></p>
      <button type="submit" disabled={busy}>Record probability</button>
    </form>}
    <p>Most recent {forecasts.length} / maximum 200 organization records shown. Outcomes are analyst-recorded, linked to evidence and not independently verified.</p>
    {forecasts.map(forecast => <article key={forecast.id} className="platform-detail__block"><h3>{forecast.question}</h3><p>Analyst probability: {(forecast.probability * 100).toFixed(2)}% · horizon {forecast.horizon} · recorded {forecast.createdAt}</p><p>{forecast.rationale}</p><a href={forecast.sourceUrl} target="_blank" rel="noreferrer">Forecast evidence</a>
      {forecast.outcome !== null ? <p>Recorded outcome: {forecast.outcome ? 'Yes' : 'No'} · resolved {forecast.resolvedAt} · Brier score {forecast.brierScore?.toFixed(4)} · <a href={forecast.outcomeSourceUrl ?? undefined} target="_blank" rel="noreferrer">Outcome evidence</a></p> : <><p>Unresolved / unscored. Resolution is accepted only after the horizon.</p><label>Outcome evidence URL <input type="url" value={outcomeSources[forecast.id] ?? ''} onChange={event => setOutcomeSources(values => ({ ...values, [forecast.id]: event.target.value }))} /></label>{' '}<button type="button" disabled={busy || !writable} onClick={() => void mutate('PATCH', { id: forecast.id, outcome: true, sourceUrl: outcomeSources[forecast.id] })}>Record yes</button>{' '}<button type="button" disabled={busy || !writable} onClick={() => void mutate('PATCH', { id: forecast.id, outcome: false, sourceUrl: outcomeSources[forecast.id] })}>Record no</button></>}
    </article>)}
  </section>;
}
