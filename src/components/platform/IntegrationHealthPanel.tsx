'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { IntegrationStatus } from '@/lib/integrations/status';
export default function IntegrationHealthPanel() {
  const [items, setItems] = useState<IntegrationStatus[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/platform/integrations', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Sign in with organization administration access to view feed health.');
      const body = await response.json(); setItems(body.integrations);
    }).catch(caught => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Health unavailable.'); });
    return () => controller.abort();
  }, []);
  return <section className="platform-section" aria-label="Feed connection health"><h2>Feed connection health</h2>
    <p>Green: last test succeeded. Amber: untested, configuration-only or not configured. Red: last connection test failed. Disabled sources stay off. Connection success does not guarantee fresh coverage.</p>
    {error && <p role="status">{error}</p>}
    <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Integration</th><th>Health</th><th>Last success</th><th>Last check</th><th>Latency</th><th>Storage / error</th></tr></thead><tbody>{items.map(item => {
      const color = item.status === 'Error' ? '#f87171' : item.observation?.scope === 'connection' && item.observation.lastSuccessAt && item.status === 'Configured' ? '#4ade80' : '#fbbf24';
      return <tr key={item.id}><td>{item.name}</td><td style={{ color }}>{item.status === 'Error' ? 'Red' : color === '#4ade80' ? 'Green' : 'Amber'} · {item.status}</td><td>{item.observation?.lastSuccessAt ?? 'Never observed'}</td><td>{item.observation?.checkedAt ?? 'Not tested'}</td><td>{item.observation ? `${item.observation.latencyMs} ms` : '—'}</td><td>{item.storage ?? 'Not recorded'} {item.observation?.error ?? ''}</td></tr>;
    })}</tbody></table></div><Link href="/admin/integrations">Configure and test integrations</Link>
  </section>;
}
