'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, sendJson } from './api';
import JobShell from './JobShell';
import styles from './jobfile.module.css';
import { useLocale } from './useLocale';
import type { TodayItem } from '@/lib/jobfile/today';

type Today = { items: TodayItem[]; interruptions: number; waiting: number; budget: number; demo: boolean };

/** Today list. On a phone: swipe right = done, swipe left = snooze; buttons for everything. */
export default function TodayWorkspace() {
  const locale = useLocale(), { t, pick } = locale;
  const [scope, setScope] = useState<'me' | 'team'>('me'), [today, setToday] = useState<Today | null>(null), [message, setMessage] = useState('');
  const start = useRef<{ id: string; x: number } | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try { setToday(await getJson<Today>(`/api/jobfiles/today?scope=${scope}`, signal)); } catch (error) { if (!signal?.aborted) setMessage(error instanceof Error ? error.message : 'Unavailable.'); }
  }, [scope]);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); return () => controller.abort(); }, [load]);
  const act = async (itemId: string, action: 'done' | 'snooze' | 'escalate' | 'not_a_problem') => { try { await sendJson('/api/jobfiles/today', 'POST', { itemId, action }); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Failed.'); } };
  return <JobShell demo={today?.demo ?? false} locale={locale}>
    {message && <p role="status" className={styles.muted}>{message}</p>}
    <div className={styles.toolbar}><h2>{t('today.title')}</h2>
      <div className={styles.actions}><button type="button" className={`${styles.button} ${scope === 'me' ? '' : styles.secondary}`} onClick={() => setScope('me')}>Mine</button><button type="button" className={`${styles.button} ${scope === 'team' ? '' : styles.secondary}`} onClick={() => setScope('team')}>Team</button>
        <Link prefetch={false} className={`${styles.button} ${styles.secondary}`} href="/api/jobfiles/export?format=xlsx&entity=all">Export xlsx</Link></div></div>
    {today && today.waiting > 0 && <p className={styles.muted}>{t('today.waiting', { count: today.waiting })} Interruptions today: {today.interruptions} / {today.budget}.</p>}
    <div className={styles.today}>{today?.items.map(item => <article key={item.id} className={styles.todayItem}
      onTouchStart={event => { start.current = { id: item.id, x: event.touches[0].clientX }; }}
      onTouchEnd={event => { const from = start.current; start.current = null; if (!from || from.id !== item.id) return; const dx = event.changedTouches[0].clientX - from.x; if (Math.abs(dx) > 80) void act(item.id, (dx > 0) === (locale.dir === 'ltr') ? 'done' : 'snooze'); }}>
      <div>
        <p>{item.interrupt && <span className={`${styles.chip} ${styles.bad}`}>!</span>} <span className={styles.chip}>{item.kind.replace(/_/g, ' ')}</span> <strong>{pick(item.titleEn, item.titleAr)}</strong></p>
        <p className={styles.muted}>{item.probability !== null ? `${Math.round(item.probability * 100)}% × ${item.cost ?? '—'} → priority ${item.priority}` : `priority ${item.priority}`}{item.dueAt ? ` · due ${new Date(item.dueAt).toLocaleString()}` : ''}{item.state === 'escalated' ? ' · escalated' : ''}{item.jobFileId && <> · <Link href={`/jobs/${item.jobFileId}`}>open job</Link></>}</p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => void act(item.id, 'done')}>{t('today.done')}</button>
        <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => void act(item.id, 'snooze')}>{t('today.snooze')}</button>
        <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => void act(item.id, 'escalate')}>{t('today.escalate')}</button>
        <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => void act(item.id, 'not_a_problem')}>{t('today.notProblem')}</button>
      </div>
    </article>)}</div>
    {today && !today.items.length && <p className={styles.muted}>Nothing waiting.</p>}
  </JobShell>;
}
