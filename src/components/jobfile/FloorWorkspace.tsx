'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, sendJson } from './api';
import styles from './jobfile.module.css';
import { useLocale } from './useLocale';

type View = { job: { id: string; jobNumber: string; isSynthetic: boolean }; milestones: Array<{ code: string; actualAt: string | null }>; milestoneLabels?: Record<string, string>; demo: boolean };

/** Phone page for the floor: tap a milestone done, or count pieces with a pallet photo. */
export default function FloorWorkspace({ jobFileId }: { jobFileId: string }) {
  const locale = useLocale(), { t, dir } = locale, photo = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View | null>(null), [status, setStatus] = useState(''), [pieces, setPieces] = useState(''), [weight, setWeight] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setView(await getJson<View>(`/api/jobfiles/${jobFileId}`)); } catch (error) { setStatus(error instanceof Error ? error.message : 'Unavailable.'); } }, [jobFileId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const uploadPhoto = async () => {
    const file = photo.current?.files?.[0]; if (!file) return null;
    const form = new FormData(); form.set('channel', 'photo'); form.set('jobFileId', jobFileId); form.append('files', file);
    const response = await fetch('/api/jobfiles/intake', { method: 'POST', body: form }), body = await response.json().catch(() => ({}));
    return response.ok ? body.documents?.[0]?.id ?? null : null;
  };
  const act = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try { const photoDocumentId = await uploadPhoto(); await sendJson(`/api/jobfiles/${jobFileId}/milestones`, 'POST', { ...payload, photoDocumentId }); setStatus('Saved.'); if (photo.current) photo.current.value = ''; await load(); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Failed.'); } finally { setBusy(false); }
  };
  if (!view) return <div className={styles.capture} dir={dir}><p role="status">{status || 'Loading…'}</p></div>;
  return <div className={styles.capture} dir={dir}>
    <h1>{view.job.jobNumber}{view.job.isSynthetic && <span className={styles.synthetic}>{t('app.synthetic')}</span>}</h1>
    <label className={styles.muted}>Optional photo <input ref={photo} type="file" accept="image/*" capture="environment" /></label>
    {view.milestones.map(milestone => <button key={milestone.code} type="button" disabled={busy || Boolean(milestone.actualAt)} className={`${styles.button} ${styles.big} ${milestone.actualAt ? styles.secondary : ''}`}
      onClick={() => void act({ action: 'tap', code: milestone.code })}>{milestone.actualAt ? '✓ ' : ''}{view.milestoneLabels?.[milestone.code] ?? milestone.code}</button>)}
    <section className={styles.card}><h2>Warehouse tally</h2>
      <input className={styles.input} inputMode="numeric" placeholder="Pieces counted" value={pieces} onChange={event => setPieces(event.target.value.replace(/\D/g, ''))} />
      <input className={styles.input} inputMode="decimal" placeholder="Weight kg (optional)" value={weight} onChange={event => setWeight(event.target.value.replace(/[^\d.]/g, ''))} />
      <button type="button" className={`${styles.button} ${styles.big}`} disabled={busy || !pieces} onClick={() => void act({ action: 'count', handoff: 'warehouse_tally', pieces: Number(pieces), weightKg: weight ? Number(weight) : undefined }).then(() => { setPieces(''); setWeight(''); })}>Done</button>
    </section>
    {status && <p role="status">{status}</p>}
  </div>;
}
