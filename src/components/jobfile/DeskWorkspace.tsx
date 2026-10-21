'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { getJson } from './api';
import JobShell from './JobShell';
import styles from './jobfile.module.css';
import { useLocale } from './useLocale';

type Desk = {
  demo: boolean; queue: Array<{ id: string; jobFileId: string | null; jobNumber: string | null; docTypeCode: string | null; fileName: string; reader: string | null; suggested: number }>;
  results: Array<{ id: string; jobFileId: string | null; jobNumber: string | null; docTypeCode: string | null; fileName: string; receivedAt: string | null; versions: Array<{ id: string; versionNumber: number; createdAt: string }> }>;
  me: { documents: number; errors: number; streak: number; clean?: boolean }; team: Array<{ documentType: string; processStep: string; total: number; errors: number; errorRate: number }> | null;
};

export default function DeskWorkspace() {
  const locale = useLocale(), { t } = locale;
  const [desk, setDesk] = useState<Desk | null>(null), [query, setQuery] = useState(''), [message, setMessage] = useState('');
  const load = useCallback(async (q: string, signal?: AbortSignal) => {
    try { setDesk(await getJson<Desk>(`/api/jobfiles/desk?q=${encodeURIComponent(q)}`, signal)); } catch (error) { if (!signal?.aborted) setMessage(error instanceof Error ? error.message : 'Unavailable.'); }
  }, []);
  useEffect(() => { const controller = new AbortController(), timer = window.setTimeout(() => void load(query, controller.signal), 250); return () => { controller.abort(); window.clearTimeout(timer); }; }, [load, query]);
  return <JobShell demo={desk?.demo ?? false} locale={locale}>
    {message && <p role="status" className={styles.muted}>{message}</p>}
    {desk && <p className={styles.banner}>{desk.me.clean ? t('desk.streak', { count: desk.me.streak }) : t('desk.streakBroken', { count: desk.me.streak })} <span className={styles.muted}>(only you can see this)</span></p>}
    <section className={styles.card}><h2>{t('desk.title')}: waiting for confirmation</h2>
      {desk?.queue.map(item => <div key={item.id} className={styles.row}><Link href={`/jobs/${item.jobFileId}`}>{item.jobNumber ?? 'Unmatched'}</Link><span className={styles.chip}>{item.docTypeCode?.replace(/_/g, ' ')}</span><span>{item.fileName}</span>
        <span className={`${styles.chip} ${styles.warn}`}>{item.suggested} to confirm</span>{item.reader === 'tesseract' && <span className={styles.muted}>{t('desk.lowConfidence')}</span>}</div>)}
      {desk && !desk.queue.length && <p className={styles.muted}>Nothing to confirm.</p>}
    </section>
    <section className={styles.card}><h3>Search and archive</h3>
      <input className={styles.input} value={query} onChange={event => setQuery(event.target.value)} placeholder="Any reference, party or text" aria-label="Search documents" />
      {desk?.results.map(item => <div key={item.id} className={styles.row}><Link href={`/jobs/${item.jobFileId}`}>{item.jobNumber ?? '—'}</Link><span className={styles.chip}>{item.docTypeCode?.replace(/_/g, ' ')}</span><span>{item.fileName}</span>
        <span className={styles.muted}>{item.versions.map(version => `v${version.versionNumber} ${new Date(version.createdAt).toLocaleDateString()}`).join(' ← ')}</span></div>)}
    </section>
    {desk?.team && <section className={styles.card}><h3>Team error rates (by document type and step, no names)</h3>
      {desk.team.map(row => <div key={row.documentType + row.processStep} className={styles.row}><span>{row.documentType.replace(/_/g, ' ')}</span><span className={styles.chip}>{row.processStep}</span><span>{row.errors} / {row.total}</span><strong>{row.errorRate}%</strong></div>)}
      {!desk.team.length && <p className={styles.muted}>No checked documents yet.</p>}
    </section>}
  </JobShell>;
}
