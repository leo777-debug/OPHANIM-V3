'use client';

import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export default function HealthDashboard() {
  const [health, setHealth] = useState<any>(null);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => { try { const response = await fetch('/api/platform/health', { cache: 'no-store' }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Health status unavailable.'); setHealth(body); setMessage(''); } catch (error) { setMessage(error instanceof Error ? error.message : 'Health status unavailable.'); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="platform-content"><section className="platform-section"><div className="platform-section__heading"><div><p>Internal only</p><h2>Platform health</h2></div><button type="button" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button></div>{message && <p className="platform-notice">{message}</p>}{health && <><div className="platform-summary"><div className="platform-metric"><span>Platform</span><strong>{health.status}</strong></div><div className="platform-metric"><span>Database</span><strong>{health.database.status}</strong></div><div className="platform-metric"><span>Uptime</span><strong>{health.uptime}s</strong></div><div className="platform-metric"><span>Version</span><strong>{health.version}</strong></div></div><div className="platform-detail__block"><h3>Required environment</h3>{health.environment.map((item: any) => <p key={item.name}><strong>{item.configured ? 'Configured' : 'Missing'}</strong> {item.name}{item.required ? ' (required)' : ''}</p>)}</div><div className="platform-detail__block"><h3>Recent jobs</h3>{health.jobs.length ? health.jobs.map((job: any) => <p key={job.job_key}><strong>{job.status}</strong> {job.job_key}</p>) : <p>No job run data yet.</p>}</div></>}</section></div>;
}
