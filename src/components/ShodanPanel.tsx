'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import type { ShodanHost, ShodanInfo, ShodanScan, ShodanSearch, ShodanService } from '@/lib/shodan/types';

type Mode = 'search' | 'count' | 'hosts' | 'resolve' | 'reverse' | 'scan';
type Result = { mode: Mode | 'api-info' | 'scan-status'; value: Record<string, unknown> };
const inputStyle = 'w-full min-w-0 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';
const buttonStyle = 'inline-flex min-h-9 items-center justify-center gap-2 rounded border border-[var(--border-primary)] px-3 py-2 text-xs disabled:opacity-40';

function ServiceRow({ service }: { service: ShodanService }) {
  return <li className="border-b border-[var(--border-primary)] py-3 last:border-0">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="break-all">{service.ip_str}:{service.port ?? '--'}</strong><span>{service.transport ?? '--'}</span></div>
    <p className="break-words text-[var(--text-muted)]">{[service.org, service.product, service.location.city, service.location.country].filter(Boolean).join(' | ') || 'No service metadata'}</p>
    {service.hostnames.length > 0 && <p className="break-all">{service.hostnames.join(', ')}</p>}
    <p className="text-xs text-[var(--text-muted)]">Observed: {service.timestamp ?? 'Unknown'}</p>
    {service.data && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs">{service.data}</pre>}
  </li>;
}
function HostResult({ host }: { host: ShodanHost }) {
  return <section className="border-b border-[var(--border-primary)] py-3">
    <h4 className="font-semibold break-all">{host.ip}</h4>
    <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-1 text-xs">
      {Object.entries({ Ports: host.ports.join(', '), Hostnames: host.hostnames.join(', '), Organization: host.org, ISP: host.isp, ASN: host.asn, OS: host.os, Updated: host.last_update, 'Reported CVEs': host.vulns.join(', ') }).map(([label, value]) => <div key={label} className="contents"><dt className="text-[var(--text-muted)]">{label}</dt><dd className="break-all">{value || 'Not reported'}</dd></div>)}
    </dl>
    <ul className="mt-2">{host.services.map((service, index) => <ServiceRow key={`${service.port}:${index}`} service={service} />)}</ul>
  </section>;
}

export default function ShodanPanel() {
  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [facets, setFacets] = useState('port,org,country');
  const [history, setHistory] = useState(false), [minify, setMinify] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [credits, setCredits] = useState<ShodanInfo | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [creditWarnings, setCreditWarnings] = useState<string[]>([]);
  const [creditsApproved, setCreditsApproved] = useState(false);
  const [scanId, setScanId] = useState('');
  const submission = useRef<{ query: string; requestId: string } | null>(null);
  const active = useRef(false);

  async function run(operation: Mode | 'api-info' | 'scan-status' = mode, page = 1) {
    if (active.current) return;
    active.current = true;
    setBusy(true); setError('');
    try {
      if (operation === 'search' || operation === 'scan') {
        const check = await fetch('/api/osint/shodan?operation=api-info', { cache: 'no-store', signal: AbortSignal.timeout(30000) });
        const account = await check.json();
        if (!check.ok || account.error) throw new Error(account.error ?? 'Could not check Shodan credits.');
        setCredits(account as ShodanInfo);
        const low = account.warnings?.[operation === 'scan' ? 'scan' : 'query'] ?? [];
        setCreditWarnings(low);
        if (low.length && !creditsApproved) { setCreditsApproved(true); return; }
      }
      const params = new URLSearchParams({ operation, q: query, facets, page: String(page), ips: query, hostnames: query, history: String(history), minify: String(minify), scan_id: scanId });
      let options: RequestInit = { cache: 'no-store', signal: AbortSignal.timeout(60000) };
      if (operation === 'scan') {
        if (!confirmed) throw new Error('Confirm authorization and the scan-credit charge first.');
        if (!submission.current || submission.current.query !== query) submission.current = { query, requestId: crypto.randomUUID() };
        options = { ...options, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ips: query, confirm: true, requestId: submission.current.requestId }) };
      }
      const response = await fetch(`/api/osint/shodan${operation === 'scan' ? '' : `?${params}`}`, options);
      const value = await response.json();
      if (!response.ok || value.error) throw new Error(value.error ?? 'Shodan request failed.');
      if (operation === 'api-info') setCredits(value as ShodanInfo);
      if (value.credits) setCredits(value.credits as ShodanInfo);
      if (operation === 'scan') { setScanId(String(value.id)); setConfirmed(false); }
      setResult({ mode: operation, value });
    } catch (caught) {
      setError(caught instanceof Error && caught.name !== 'TimeoutError' ? caught.message : 'Shodan request timed out. For a scan, do not resubmit; check the scan status or contact an administrator.');
    } finally { active.current = false; setBusy(false); }
  }

  const search = result?.mode === 'search' ? result.value as unknown as ShodanSearch : null;
  const warnings = [...new Set([...creditWarnings, ...(Array.isArray(result?.value.warnings) ? result.value.warnings as string[] : [])])];
  const scan = result?.mode === 'scan' || result?.mode === 'scan-status' ? result.value as unknown as ShodanScan : null;
  return <section aria-label="Shodan intelligence" className="min-w-0 space-y-3 text-sm text-[var(--text-primary)]">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Shodan</h3>
      <button type="button" className={buttonStyle} disabled={busy} onClick={() => run('api-info')}><RefreshCw size={14} />Credits</button>
    </div>
    {credits && <p className="text-xs text-[var(--text-muted)]">Plan: {credits.plan ?? 'Unknown'} | Query credits: {credits.query_credits ?? 'Unknown'} | Scan credits: {credits.scan_credits ?? 'Unknown'}</p>}
    <form onSubmit={(event) => { event.preventDefault(); void run(); }} className="space-y-3">
      <label className="block text-xs">Operation<select aria-label="Shodan operation" className={`${inputStyle} mt-1`} value={mode} disabled={busy} onChange={(event) => { setMode(event.target.value as Mode); setResult(null); setError(''); setConfirmed(false); setCreditsApproved(false); setCreditWarnings([]); }}>
        <option value="search">Database search</option><option value="count">Count and facets</option><option value="hosts">IP / host lookup</option><option value="resolve">DNS resolve</option><option value="reverse">Reverse DNS</option><option value="scan">Authorized active scan</option>
      </select></label>
      <label className="block text-xs">{mode === 'search' || mode === 'count' ? 'Shodan query' : mode === 'resolve' ? 'Hostnames' : 'IPs / targets'}
        <input aria-label="Shodan query or targets" className={`${inputStyle} mt-1`} value={query} maxLength={mode === 'scan' ? 4096 : 1000} disabled={busy} onChange={(event) => { setQuery(event.target.value); setResult(null); setConfirmed(false); setCreditsApproved(false); setCreditWarnings([]); }} placeholder={mode === 'search' || mode === 'count' ? 'product:nginx country:AE' : mode === 'resolve' ? 'example.com' : mode === 'scan' ? 'Owned IPs or authorized CIDRs' : '8.8.8.8,1.1.1.1'} />
      </label>
      {(mode === 'search' || mode === 'count') && <label className="block text-xs">Facets<input aria-label="Shodan facets" className={`${inputStyle} mt-1`} maxLength={300} value={facets} disabled={busy} onChange={(event) => { setFacets(event.target.value); setResult(null); setCreditsApproved(false); }} /></label>}
      {mode === 'hosts' && <div className="flex flex-wrap gap-4 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={history} disabled={busy} onChange={(event) => setHistory(event.target.checked)} />History</label><label className="flex items-center gap-2"><input type="checkbox" checked={minify} disabled={busy} onChange={(event) => setMinify(event.target.checked)} />Minified (no banners)</label></div>}
      {mode === 'scan' && <div className="space-y-2 border-l-2 border-amber-400 pl-3 text-xs">
        <p>Active scans contact live hosts and consume Shodan scan credits. Workspace-owner permission is required.</p>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>I own these targets or have written authorization, and approve the scan-credit charge.</span></label>
      </div>}
      <button className={`${buttonStyle} w-full bg-[var(--bg-tertiary)]`} disabled={busy || !query.trim() || (mode === 'scan' && !confirmed)}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : mode === 'scan' ? <ShieldCheck size={16} /> : <Search size={16} />}
        {creditsApproved && creditWarnings.length ? 'Continue with low credits' : mode === 'scan' ? 'Submit authorized scan' : mode === 'hosts' ? 'Look up hosts' : mode === 'count' ? 'Count results' : 'Run query'}
      </button>
    </form>
    {error && <p role="alert" className="break-words text-sm text-red-400">{error}</p>}
    {warnings.map((warning) => <p key={warning} role="status" className="text-xs text-amber-400">{warning}</p>)}
    {search && <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{search.total.toLocaleString()} results | Page {search.page}</span><div className="flex gap-2"><button aria-label="Previous Shodan page" title="Previous page" className={buttonStyle} disabled={busy || search.page <= 1} onClick={() => run('search', search.page - 1)}><ChevronLeft size={16} /></button><button aria-label="Next Shodan page" title="Next page" className={buttonStyle} disabled={busy || search.page * 100 >= search.total} onClick={() => run('search', search.page + 1)}><ChevronRight size={16} /></button></div></div>}
    {result && <div aria-live="polite" className="max-h-[50vh] overflow-auto text-xs">
      {search && <ul>{search.matches.map((service, index) => <ServiceRow key={`${service.ip_str}:${service.port}:${index}`} service={service} />)}</ul>}
      {search?.matches.length === 0 && <p>No matching Shodan records.</p>}
      {(result.mode === 'search' || result.mode === 'count') && <div className="space-y-2">{result.mode === 'count' && <p>{Number(result.value.total).toLocaleString()} results</p>}{Object.entries((result.value.facets ?? {}) as ShodanSearch['facets']).map(([name, entries]) => <section key={name}><h4 className="mt-2 font-semibold">{name}</h4><ul>{entries.map((entry) => <li key={String(entry.value)} className="flex justify-between gap-3"><span className="break-all">{entry.value}</span><span>{entry.count.toLocaleString()}</span></li>)}</ul></section>)}</div>}
      {result.mode === 'hosts' && (result.value.results as Array<{ ip: string; host?: ShodanHost; error?: string }>).map((item) => item.host ? <HostResult key={item.ip} host={item.host} /> : <p key={item.ip}>{item.ip}: {item.error}</p>)}
      {(result.mode === 'resolve' || result.mode === 'reverse') && <dl className="space-y-2">{Object.entries(result.value).map(([name, value]) => <div key={name}><dt className="font-semibold break-all">{name}</dt><dd className="break-all">{Array.isArray(value) ? value.join(', ') || 'No records' : String(value ?? 'No records')}</dd></div>)}</dl>}
      {scan && <dl className="space-y-1"><dt>Scan ID</dt><dd className="break-all">{scan.id}</dd><dt>Status</dt><dd>{scan.status}</dd><dt>Hosts</dt><dd>{scan.count ?? 'Not reported'}</dd><dt>Scan credits left</dt><dd>{scan.credits_left ?? 'Not reported'}</dd></dl>}
    </div>}
    <div className="flex min-w-0 gap-2"><input aria-label="Shodan scan ID" placeholder="Scan ID" className={inputStyle} value={scanId} disabled={busy} onChange={(event) => setScanId(event.target.value)} /><button type="button" className={`${buttonStyle} shrink-0`} disabled={busy || !scanId.trim()} onClick={() => run('scan-status')}><RefreshCw size={14} />Status</button></div>
  </section>;
}
