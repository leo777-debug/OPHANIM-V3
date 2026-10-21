'use client';
import { useCallback, useEffect, useState } from 'react';
import styles from './jobfile.module.css';
import { useLocale } from './useLocale';

type Trip = { jobNumber: string; synthetic: boolean; locationOptIn: boolean; expiresAt: string; events: Array<{ event: string; at: string }> };
const LABELS = { arrived: ['Arrived', 'وصلت'], loaded: ['Loaded', 'تم التحميل'], left: ['Left', 'غادرت'] } as const;

/** Driver page: three big buttons. Location is only sent if the link allows it AND the driver ticks consent, per tap. */
export default function DriverWorkspace({ token }: { token: string }) {
  const locale = useLocale(), { dir, pick, t } = locale;
  const [trip, setTrip] = useState<Trip | null>(null), [status, setStatus] = useState(''), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false);
  const url = `/api/driver/${encodeURIComponent(token)}`;
  const load = useCallback(async () => { const response = await fetch(url, { cache: 'no-store' }), body = await response.json().catch(() => ({})); if (response.ok) setTrip(body); else setStatus(body.error ?? 'Link unavailable.'); }, [url]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const tap = async (event: keyof typeof LABELS) => {
    setBusy(true);
    const position = consent && trip?.locationOptIn && 'geolocation' in navigator ? await new Promise<GeolocationPosition | null>(resolve => navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 8000, maximumAge: 60000 })) : null;
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, consent, latitude: position?.coords.latitude, longitude: position?.coords.longitude }) });
    setStatus(response.ok ? `${pick(LABELS[event][0], LABELS[event][1])} ✓` : 'Not saved. Try again.'); setBusy(false); await load();
  };
  if (!trip) return <div className={styles.capture} dir={dir}><p role="status">{status || '…'}</p></div>;
  const done = new Set(trip.events.map(item => item.event));
  return <div className={styles.capture} dir={dir}>
    <h1>{trip.jobNumber}{trip.synthetic && <span className={styles.synthetic}>{t('app.synthetic')}</span>}</h1>
    {(Object.keys(LABELS) as Array<keyof typeof LABELS>).map(event => <button key={event} type="button" disabled={busy} className={`${styles.button} ${styles.big} ${done.has(event) ? styles.secondary : ''}`} onClick={() => void tap(event)}>{done.has(event) ? '✓ ' : ''}{pick(LABELS[event][0], LABELS[event][1])}</button>)}
    {trip.locationOptIn && <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> {pick('Share my location with this tap (this trip only)', 'مشاركة موقعي مع هذه الضغطة (لهذه الرحلة فقط)')}</label>}
    <p className={styles.muted}>{pick('Link valid until', 'الرابط صالح حتى')} {new Date(trip.expiresAt).toLocaleString()}</p>
    {status && <p role="status">{status}</p>}
    <select className={styles.select} value={locale.locale} onChange={event => locale.setLocale(event.target.value === 'ar' ? 'ar' : 'en')} aria-label="Language"><option value="en">English</option><option value="ar">العربية</option></select>
  </div>;
}
