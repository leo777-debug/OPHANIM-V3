'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './jobfile.module.css';
import { useLocale } from './useLocale';

// Offline-first capture: pages are queued in IndexedDB and retried until the
// server confirms. clientId makes retries idempotent on the server.
type Queued = { id: string; jobFileId: string | null; createdAt: number; files: Array<{ name: string; type: string; blob: Blob }> };
const DB = 'ophanim-capture', STORE = 'queue';
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = indexedDB.open(DB, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => { const request = run(db.transaction(STORE, mode).objectStore(STORE)); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

export default function CaptureWorkspace({ jobFileId }: { jobFileId: string | null }) {
  const locale = useLocale(), { t, dir } = locale;
  const input = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<File[]>([]), [previews, setPreviews] = useState<string[]>([]), [queued, setQueued] = useState(0), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const flush = useCallback(async () => {
    let items: Queued[] = [];
    try { items = await withStore<Queued[]>('readonly', store => store.getAll() as IDBRequest<Queued[]>); } catch { return; }
    setQueued(items.length);
    for (const item of items.sort((a, b) => a.createdAt - b.createdAt)) {
      const form = new FormData(); form.set('channel', 'photo'); form.set('clientId', item.id); if (item.jobFileId) form.set('jobFileId', item.jobFileId);
      for (const file of item.files) form.append('files', new File([file.blob], file.name, { type: file.type }));
      try {
        const response = await fetch('/api/jobfiles/intake', { method: 'POST', body: form });
        if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 403 && response.status !== 429)) {
          await withStore('readwrite', store => store.delete(item.id));
          const body = await response.json().catch(() => ({}));
          setStatus(response.ok ? `${t('capture.sent')}${body.intake?.status === 'review' ? ' (needs review)' : ''}` : body.error ?? 'Rejected.');
        } else break;
      } catch { break; /* Offline: keep queued. */ }
    }
    try { setQueued((await withStore<Queued[]>('readonly', store => store.getAll() as IDBRequest<Queued[]>)).length); } catch { /* ignore */ }
  }, [t]);
  useEffect(() => {
    void Promise.resolve().then(flush);
    const online = () => void flush(), timer = window.setInterval(() => void flush(), 30000);
    window.addEventListener('online', online);
    return () => { window.removeEventListener('online', online); window.clearInterval(timer); };
  }, [flush]);
  useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews]);
  const add = (files: FileList | null) => { if (!files?.length) return; const list = [...files].slice(0, 20); setPages(current => [...current, ...list]); setPreviews(current => [...current, ...list.map(file => URL.createObjectURL(file))]); };
  const send = async () => {
    setBusy(true);
    try {
      const item: Queued = { id: crypto.randomUUID(), jobFileId, createdAt: Date.now(), files: pages.map(file => ({ name: file.name, type: file.type || 'image/jpeg', blob: file })) };
      await withStore('readwrite', store => store.put(item));
      setPages([]); setPreviews([]); await flush();
    } catch { setStatus('Could not save the photos on this phone. Try again.'); } finally { setBusy(false); }
  };
  return <div className={styles.capture} dir={dir}>
    <h1>{t('capture.title')}</h1>
    <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" multiple hidden onChange={event => { add(event.target.files); event.target.value = ''; }} />
    <button type="button" className={`${styles.button} ${styles.big}`} onClick={() => input.current?.click()}>{pages.length ? t('capture.addPage') : t('capture.take')}</button>
    {!!previews.length && <div className={styles.thumbs}>{previews.map((url, index) => (
      // Local blob previews cannot go through the image optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      <img key={url} src={url} alt={`Page ${index + 1}`} />
    ))}</div>}
    {!!pages.length && <button type="button" className={`${styles.button} ${styles.big}`} disabled={busy} onClick={() => void send()}>{t('capture.send', { count: pages.length })}</button>}
    {queued > 0 && <p className={styles.banner} role="status">{t('capture.queued', { count: queued })}</p>}
    {status && <p role="status">{status}</p>}
    <label className={styles.muted}>{t('app.language')} <select className={styles.select} value={locale.locale} onChange={event => locale.setLocale(event.target.value === 'ar' ? 'ar' : 'en')}><option value="en">English</option><option value="ar">العربية</option></select></label>
  </div>;
}
