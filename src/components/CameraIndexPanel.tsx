'use client';

import { useEffect, useState } from 'react';
import { CAMERA_REGIONS, type CameraRegion } from '@/lib/cameras/regions';
import type { CameraIndexResult } from '@/lib/cameras/windy';
import type { CctvCamera } from '@/app/api/cctv/types';

const inputStyle = 'w-full rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] p-2 text-[var(--text-primary)]';

export default function CameraIndexPanel({ onSelect }: { onSelect?: (camera: CctvCamera) => void }) {
  const [region, setRegion] = useState<CameraRegion>('gcc');
  const [country, setCountry] = useState('');
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<CameraIndexResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true); setError(''); setResult(null);
      try {
        const params = new URLSearchParams({ region, offset: String(offset) });
        if (country.trim()) params.set('country', country.trim());
        const response = await fetch(`/api/cctv/indexes?${params}`, { signal: controller.signal, cache: 'no-store' });
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!body.status || !Array.isArray(body.cameras)) throw new Error(body.error || 'Camera discovery failed.');
        setResult(body);
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Camera discovery failed.');
      } finally { if (!controller.signal.aborted) setBusy(false); }
    }, 350);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [region, country, offset, revision]);

  return <section aria-label="Public camera indexes" className="space-y-3 text-xs text-[var(--text-primary)]">
    <h3 className="font-semibold">Worldwide camera indexes</h3>
    <p>Published public webcams and transport feeds. GCC searches cover UAE, Saudi Arabia, Qatar, Kuwait, Bahrain and Oman.</p>
    <label className="block">Region<select aria-label="Camera region" className={inputStyle} value={region} onChange={event => { setRegion(event.target.value as CameraRegion); setCountry(''); setOffset(0); setResult(null); }}>
      {Object.entries(CAMERA_REGIONS).map(([value, item]) => <option value={value} key={value}>{item.label}</option>)}
    </select></label>
    <label className="block">Country (optional, ISO code)<input aria-label="Camera country" placeholder="AE, SA, QA, KW, BH, OM…" className={inputStyle} maxLength={2} value={country} onChange={event => { setCountry(event.target.value.toUpperCase()); setOffset(0); setResult(null); }} /></label>
    <button type="button" className={inputStyle} disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh camera index</button>
    {busy && <p role="status">Loading published cameras…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <>
      <p role="status">{result.message}</p>
      {(result.status === 'ok' || result.status === 'partial') && <>
        <p>{result.cameras.length} cameras on this page · {result.total.toLocaleString()} index records{result.status === 'partial' ? ' (partial)' : ''}</p>
        {!result.cameras.length && <p>No published cameras returned for this selection.</p>}
        <ul className="max-h-80 space-y-2 overflow-y-auto">{result.cameras.map(camera => <li key={camera.id} className="rounded border border-[var(--border-primary)] p-2">
          <p className="font-semibold">{camera.name}</p><p>{camera.city}, {camera.country}</p>
          <p>{camera.media_kind === 'live' ? 'Published live player' : 'Publisher page / images or timelapse'}</p>
          {camera.observation_time && <p>Provider update: {camera.observation_time}</p>}
          <div className="mt-1 flex gap-3">
            {onSelect && <button type="button" className="underline" onClick={() => onSelect(camera)}>View camera</button>}
            <a href={camera.external_url} target="_blank" rel="noopener noreferrer" className="underline">Open publisher</a>
          </div>
        </li>)}</ul>
        <div className="flex justify-between gap-2">
          <button type="button" disabled={busy || offset === 0} onClick={() => { setOffset(Math.max(0, offset - 50)); setResult(null); }}>Previous</button>
          <button type="button" disabled={busy || result.nextOffset === null || result.nextOffset > 10000} onClick={() => { setOffset(result.nextOffset!); setResult(null); }}>Next</button>
        </div>
      </>}
    </>}
    <p>Webcams provided by <a className="underline" href="https://www.windy.com" target="_blank" rel="noopener noreferrer">windy.com</a> – <a className="underline" href="https://www.windy.com/webcams/add" target="_blank" rel="noopener noreferrer">add new webcam</a></p>
    <p>Shodan is available in its own tab for authenticated service metadata. It does not establish permission to view a camera.</p>
    <div className="flex gap-3"><a className="underline" href="https://www.earthcam.com/" target="_blank" rel="noopener noreferrer">EarthCam directory</a><a className="underline" href="https://www.skylinewebcams.com/" target="_blank" rel="noopener noreferrer">SkylineWebcams directory</a></div>
  </section>;
}
