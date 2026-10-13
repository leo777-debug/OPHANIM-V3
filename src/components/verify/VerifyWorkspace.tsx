'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, SearchCheck, RefreshCw, Share2, Download, Trash2, History, ShieldCheck } from 'lucide-react';
import { CLAIM_TYPES, type ParsedClaim, type VerifyResult } from '@/lib/verify/types';
import { readClientAiConfig } from '@/lib/ai/client-config';
import VerifyResultCard from './VerifyResultCard';
import styles from './verify.module.css';

type Share = { token: string; path: string; expires: string; temporary: boolean };
const examples = [{ id: 'dubai-fog', text: 'Dubai airport fog' }, { id: 'earthquake', text: 'Tokyo earthquake' }, { id: 'red-sea', text: 'Red Sea ship claim' }, { id: 'sanctions', text: 'Sanctions claim' }, { id: 'opinion', text: 'Opinion' }];
async function post(path: string, body: unknown, method = 'POST') {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Request failed.'); return data;
}
export default function VerifyWorkspace() {
  const [text, setText] = useState(''), [url, setUrl] = useState(''), [permission, setPermission] = useState(false);
  const [claim, setClaim] = useState<ParsedClaim | null>(null), [parser, setParser] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null), [previous, setPrevious] = useState<VerifyResult[]>([]);
  const [history, setHistory] = useState<VerifyResult[]>([]), [historyNotice, setHistoryNotice] = useState('Loading history...');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [ai, setAi] = useState(false), [consent, setConsent] = useState(false), [share, setShare] = useState<Share | null>(null);
  const loadHistory = useCallback(async () => {
    try { const response = await fetch('/api/verify/history', { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setHistory(data.results); setHistoryNotice(data.reason || (data.results.length ? '' : 'No saved checks yet.')); }
    catch { setHistoryNotice('History is unavailable. Check your sign-in and database connection.'); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/verify/history', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error); return data;
    }).then((data) => { setHistory(data.results); setHistoryNotice(data.reason || (data.results.length ? '' : 'No saved checks yet.')); })
      .catch(() => { if (!controller.signal.aborted) setHistoryNotice('History is unavailable. Check your sign-in and database connection.'); });
    return () => controller.abort();
  }, []);
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : 'Check unavailable.'); } finally { setBusy(false); } }
  function config() { return ai ? readClientAiConfig() : undefined; }
  async function check(options: { fixture?: string; previousId?: string } = {}) {
    const data = await post('/api/verify/check', { claim: claim ?? { text: 'Demo claim' }, url, urlPermission: permission, confirmed: true, ...options, useAi: ai, aiConfig: config() });
    if (result) setPrevious((items) => [result, ...items].slice(0, 20));
    if (options.fixture) { setText(data.result.claim.text); setClaim(null); }
    setResult(data.result); setNotice(data.storageNotice); setShare(null); setConsent(false); await loadHistory();
  }
  async function download() {
    if (!result) return;
    const response = await fetch('/api/verify/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: result.id }) });
    if (!response.ok) throw new Error((await response.json()).error ?? 'Image unavailable.');
    const objectUrl = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = 'ophanim-verify.png'; anchor.click(); URL.revokeObjectURL(objectUrl);
  }
  function field(key: keyof ParsedClaim, value: unknown) { setClaim((current) => current ? { ...current, [key]: value } : null); }
  function placeField(key: keyof ParsedClaim['place'], value: unknown) { setClaim((current) => current ? { ...current, place: { ...current.place, [key]: value } } : null); }
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/atlas"><ArrowLeft size={18} /> Atlas</Link><Link href="/verify" className={styles.brand}><ShieldCheck /> OPHANIM <span>VERIFY</span></Link><Link href="/login">Sign in</Link></header>
    <div className={styles.title}><p>PUBLIC EVENT VERIFICATION</p><h1>Is this true?</h1></div>
    <div className={styles.layout}><div className={styles.main}>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void run(async () => { const data = await post('/api/verify/parse', { text, url, urlPermission: permission, useAi: ai, aiConfig: config() }); setClaim(data.claim); setParser(data.parser); setNotice(data.warning); }); }}>
        <label htmlFor="verify-claim">Claim</label><textarea id="verify-claim" value={text} onChange={(event) => { setText(event.target.value); setClaim(null); }} maxLength={3000} required placeholder="Dubai airport is closed" rows={3} />
        <label htmlFor="verify-url">Article URL (optional)</label><input id="verify-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} maxLength={2048} placeholder="https://..." />
        {url && <label className={styles.checkbox}><input type="checkbox" checked={permission} onChange={(event) => setPermission(event.target.checked)} />I have permission to retrieve this article&apos;s text.</label>}
        <div className={styles.actions}><label className={styles.checkbox}><input type="checkbox" checked={ai} onChange={(event) => setAi(event.target.checked)} />Use configured AI for parsing and summary</label><button disabled={busy || !text.trim()} type="submit"><SearchCheck size={18} />Review claim</button></div>
      </form>
      {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
      {claim && <section className={styles.review}><div className={styles.sectionHeading}><h2>Review parsed claim</h2><span>{parser}</span></div><div className={styles.fields}>
        <label>Type<select value={claim.type} onChange={(event) => { const type = event.target.value as ParsedClaim['type']; field('type', type); field('expectedObservation', ({ airport: 'airport_closed', storm: 'tropical_cyclone', maritime: 'ship_seized', news: 'explosion' } as Record<string, string>)[type] ?? type); }}>{CLAIM_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>Place<input value={claim.place.name} onChange={(event) => placeField('name', event.target.value)} /></label>
        <label>Latitude<input type="number" step="any" min="-90" max="90" value={claim.place.latitude ?? ''} onChange={(event) => placeField('latitude', event.target.value === '' ? null : Number(event.target.value))} /></label>
        <label>Longitude<input type="number" step="any" min="-180" max="180" value={claim.place.longitude ?? ''} onChange={(event) => placeField('longitude', event.target.value === '' ? null : Number(event.target.value))} /></label>
        <label>Airport ICAO code<input value={claim.place.code ?? ''} onChange={(event) => placeField('code', event.target.value.toUpperCase() || undefined)} /></label>
        <label>Entities (comma-separated)<input key={`${claim.text}:${claim.entities.join('|')}`} defaultValue={claim.entities.join(', ')} onBlur={(event) => field('entities', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} /></label>
        <label>Window start (UTC)<input type="datetime-local" value={claim.start.slice(0, 16)} onChange={(event) => { const time = Date.parse(`${event.target.value}Z`); if (Number.isFinite(time)) field('start', new Date(time).toISOString()); }} /></label>
        <label>Window end (UTC)<input type="datetime-local" value={claim.end.slice(0, 16)} onChange={(event) => { const time = Date.parse(`${event.target.value}Z`); if (Number.isFinite(time)) field('end', new Date(time).toISOString()); }} /></label>
        <label>Expected observation<input value={claim.expectedObservation} onChange={(event) => field('expectedObservation', event.target.value)} /></label>
        {claim.type === 'earthquake' && <label>Minimum magnitude<input type="number" min="0" max="10" step="0.1" value={claim.minimumMagnitude} onChange={(event) => field('minimumMagnitude', Number(event.target.value))} /></label>}
      </div><button className={styles.primary} disabled={busy} onClick={() => void run(() => check())}><SearchCheck size={18} />Confirm and check</button></section>}
      {result && <><div className={styles.actions}><button disabled={busy} onClick={() => void run(() => check({ previousId: result.id }))}><RefreshCw size={17} />Check again</button><button disabled={busy} onClick={() => void run(download)}><Download size={17} />Download image</button></div><VerifyResultCard result={result} />
        <section className={styles.sharing}><label className={styles.checkbox}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />This claim contains no private or organization data. Make the claim and evidence public.</label><button disabled={busy || !consent} onClick={() => void run(async () => setShare(await post('/api/verify/shares', { id: result.id, publicConsent: true })))}><Share2 size={17} />Create share link</button>
          {share && <div><Link href={share.path} target="_blank">Open shared result</Link><p>{share.temporary ? 'Temporary share (single server session).' : 'Persisted share.'} Expires {share.expires}</p><button disabled={busy} onClick={() => void run(async () => { await post('/api/verify/shares', { token: share.token }, 'DELETE'); setShare(null); })}><Trash2 size={16} />Revoke link</button></div>}
        </section></>}
      {previous.length > 0 && <section className={styles.review}><h2>Earlier checks in this session</h2>{previous.map((item) => <details key={item.id}><summary>{item.checkedAt} - {item.verdict}</summary><VerifyResultCard result={item} /></details>)}</section>}
    </div><aside className={styles.sidebar}>
      <section><h2>Synthetic replay</h2><p className={styles.muted}>Test fixtures, not live findings.</p>{examples.map((example) => <button key={example.id} disabled={busy} onClick={() => void run(() => check({ fixture: example.id }))}>{example.text}</button>)}</section>
      <section><h2><History size={18} />Your history</h2><p className={styles.muted}>{historyNotice}</p>{history.map((item) => <button key={item.id} onClick={() => { setResult(item); setClaim(item.claim); setText(item.claim.text); setShare(null); }}><strong>{item.verdict}</strong><span>{item.claim.text}</span><small>{item.checkedAt}</small></button>)}<button disabled={busy} onClick={() => void loadHistory()}><RefreshCw size={16} />Refresh history</button></section>
      <Link href="/admin/health">Source permissions and health</Link>
    </aside></div>
  </main>;
}
