'use client';

import { RefreshCw, Server } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type Provider = { id: string; name: string; configured: boolean; health: { status: string }; metrics: { requests: number; failures: number; timeouts: number } };

export default function ProviderHealthPanel() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { const response = await fetch('/api/providers', { cache: 'no-store' }); if (!response.ok) throw new Error('Provider status is unavailable.'); setProviders((await response.json()).providers ?? []); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Provider status is unavailable.'); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className="platform-section platform-provider-health"><div className="platform-section__heading"><div><p>Data sources</p><h2>Provider health</h2></div><button type="button" onClick={() => void load()} title="Refresh provider health"><RefreshCw size={16} /></button></div>{error ? <p className="platform-empty">{error}</p> : <div className="platform-provider-grid">{providers.map((provider) => <div key={provider.id} className="platform-provider"><Server size={16} /><div><strong>{provider.name}</strong><small>{provider.configured ? provider.health.status : 'not configured'} · {provider.metrics.requests} calls</small></div><span className={`platform-status platform-status--${provider.configured ? provider.health.status : 'unknown'}`} /></div>)}</div>}</section>;
}
