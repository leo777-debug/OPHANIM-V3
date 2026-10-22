'use client';
import { useCallback, useEffect, useState } from 'react';
import { getJson, sendJson } from './api';
import JobShell from './JobShell';
import styles from './jobfile.module.css';
import { useLocale } from './useLocale';

type Candidate = { jobFileId: string; jobNumber: string; score: number; reasons: string[] };
type Item = { id: string; channel: string; sender: string | null; subject: string | null; bodyText: string | null; receivedAt: string; status: string; referencesFound: Array<{ type: string; value: string; valid: boolean }>; matchCandidates: Candidate[] };

export default function ReviewQueue() {
  const locale = useLocale(), { t } = locale;
  const [items, setItems] = useState<Item[]>([]), [demo, setDemo] = useState(false), [message, setMessage] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const body = await getJson<{ items: Item[]; demo: boolean }>('/api/jobfiles/intake?status=review', signal); setItems(body.items); setDemo(body.demo); }
    catch (error) { if (!signal?.aborted) setMessage(error instanceof Error ? error.message : 'Unavailable.'); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); return () => controller.abort(); }, [load]);
  const act = async (id: string, payload: unknown) => { try { await sendJson(`/api/jobfiles/intake/${id}`, 'POST', payload); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Failed.'); } };
  return <JobShell demo={demo} locale={locale}>
    {message && <p role="status" className={styles.muted}>{message}</p>}
    <section className={styles.card}><h2>{t('review.title')}</h2>
      {!items.length && <p className={styles.muted}>Nothing to review.</p>}
      {items.map(item => <article key={item.id} className={styles.flag}>
        <p><span className={styles.chip}>{item.channel}</span> <strong>{item.subject ?? item.bodyText?.slice(0, 80) ?? '(no text)'}</strong> <span className={styles.muted}>{item.sender} · {new Date(item.receivedAt).toLocaleString()}</span></p>
        <p>{item.referencesFound.map(ref => <span key={ref.type + ref.value} className={`${styles.chip} ${ref.valid ? styles.ok : styles.bad}`}>{ref.type.toUpperCase()} {ref.value}</span>)}</p>
        {item.matchCandidates.length ? item.matchCandidates.map(candidate => <div key={candidate.jobFileId} className={styles.row}>
          <div><strong>{t('review.why')}:</strong> {candidate.reasons.join('; ')} <span className={styles.muted}>(score {candidate.score})</span></div>
          <button type="button" className={styles.button} onClick={() => void act(item.id, { action: 'attach', jobFileId: candidate.jobFileId })}>{t('review.attach', { job: candidate.jobNumber })}</button>
        </div>) : <p className={styles.muted}>{t('review.none')}</p>}
        <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => void act(item.id, { action: 'create', job: { mode: item.referencesFound.some(ref => ref.type === 'awb') ? 'air_import' : 'sea_import' } })}>{t('job.newFromDocument')}</button>
      </article>)}
    </section>
  </JobShell>;
}
