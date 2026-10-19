'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { IntegrationStatus } from '@/lib/integrations/status';

export default function IntegrationsDashboard() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [message, setMessage] = useState('Loading integration status…');
  const [protectedView, setProtectedView] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/platform/integrations', { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) { setProtectedView(true); setMessage('Sign in with organization administration access to see integrations.'); return; }
      if (!response.ok) throw new Error('Integration status unavailable.');
      const body = await response.json(); setIntegrations(body.integrations); setMessage(''); setProtectedView(false);
    } catch { setMessage('Integration status unavailable. Retry when the service is running.'); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const test = async (id: string) => {
    setPending(id); setMessage('');
    try {
      const response = await fetch('/api/platform/integrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Test unavailable.');
      setIntegrations(current => current.map(item => item.id === id ? body.integration : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Test unavailable.'); }
    finally { setPending(null); }
  };
  return <div className="platform-content"><section className="platform-section">
    <div className="platform-section__heading"><div><p>Admin · server configuration</p><h2>External services</h2></div><button type="button" onClick={() => void load()}>Refresh status</button></div>
    <p>Put keys in your server’s uncommitted .env or hosting dashboard using API_KEYS.md, then restart. Credentials are never displayed here. Environment configuration is the source of truth.</p>
    <p>Configured means settings are present. Connection observations below are process-local and clear on restart; tests do not prove current data coverage.</p>
    {message && <p role="status" className="platform-notice">{message}</p>}
    {protectedView ? <Link href="/login?returnTo=%2Fadmin%2Fintegrations">Sign in to see your organization’s data</Link> : <>
      <label>Find an integration <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Service, area or variable" /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16, marginTop: 20 }}>
        {integrations.filter(item => `${item.name} ${item.area} ${item.variables.join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(item => <article className="platform-detail__block" key={item.id}>
          <p>{item.area}</p><h3>{item.name}</h3><p><strong>{item.status}</strong></p><p>{item.unlocks}</p>
          <p>{item.variables.length ? item.variables.join(', ') : 'Keyless provider'}</p>
          <p>{item.guidance}</p><p>{item.fallback}</p>
          <p>Last successful connection: {item.observation?.lastSuccessAt ?? 'Never observed'}</p>
          <p>Last checked: {item.observation?.checkedAt ?? 'Not tested'}</p>
          {item.observation?.error && <p role="alert">{item.observation.error}</p>}
          <p><a href={item.signup} target="_blank" rel="noreferrer">Provider documentation and access</a></p>
          <button type="button" disabled={pending !== null || item.status === 'Disabled by licence'} onClick={() => void test(item.id)}>{pending === item.id ? 'Testing…' : 'Test connection'}</button>
        </article>)}
      </div>
    </>}
  </section></div>;
}
