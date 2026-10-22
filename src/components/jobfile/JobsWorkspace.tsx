'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { getJson, sendJson } from './api';
import JobShell from './JobShell';
import styles from './jobfile.module.css';
import { useLocale } from './useLocale';

type JobRow = { id: string; jobNumber: string; mode: string; status: string; clientName: string | null; origin: string | null; destination: string | null; plannedArrivalAt: string | null; isSynthetic: boolean; openFlags: number; blockFlags: number; references: Array<{ type: string; value: string; validated: boolean }> };
const MODES = ['air_import', 'air_export', 'sea_import', 'sea_export', 'road', 'multimodal'];

export default function JobsWorkspace() {
  const locale = useLocale(), { t } = locale;
  const [jobs, setJobs] = useState<JobRow[]>([]), [demo, setDemo] = useState(false), [message, setMessage] = useState(''), [search, setSearch] = useState('');
  const [form, setForm] = useState({ mode: 'air_import', clientName: '', origin: '', destination: '', awb: '' });
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const body = await getJson<{ jobs: JobRow[]; demo: boolean }>('/api/jobfiles', signal); setJobs(body.jobs); setDemo(body.demo); setMessage(''); }
    catch (error) { if (!signal?.aborted) setMessage(error instanceof Error ? error.message : 'Unavailable.'); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); return () => controller.abort(); }, [load]);
  const create = async () => {
    try {
      const references = form.awb.trim() ? [{ type: form.mode.startsWith('air') ? 'awb' : 'container', value: form.awb.trim() }] : [];
      await sendJson('/api/jobfiles', 'POST', { mode: form.mode, clientName: form.clientName, origin: form.origin, destination: form.destination, references });
      setForm({ ...form, clientName: '', awb: '' }); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create job.'); }
  };
  const needle = search.trim().toUpperCase();
  const shown = jobs.filter(job => !needle || [job.jobNumber, job.clientName, job.origin, job.destination, ...job.references.map(ref => ref.value)].some(value => value?.toUpperCase().includes(needle)));
  return <JobShell demo={demo} locale={locale}>
    {message && <p role="status" className={styles.muted}>{message} {/sign in/i.test(message) && <Link href="/login?returnTo=%2Fjobs">Sign in</Link>}</p>}
    <section className={styles.card}><h2>{t('job.list')}</h2>
      <input className={styles.input} placeholder="Search job, client, AWB, B/L, container…" value={search} onChange={event => setSearch(event.target.value)} aria-label="Search job files" />
      {shown.map(job => <div key={job.id} className={styles.row}>
        <Link href={`/jobs/${job.id}`}><strong>{job.jobNumber}</strong></Link>{job.isSynthetic && <span className={styles.synthetic}>{t('app.synthetic')}</span>}
        <span className={styles.chip}>{job.mode.replace('_', ' ')}</span><span>{job.clientName ?? '—'}</span><span className={styles.muted}>{job.origin ?? '?'} → {job.destination ?? '?'}</span>
        {job.references.slice(0, 3).map(ref => <span key={ref.type + ref.value} className={`${styles.chip} ${ref.validated ? styles.ok : styles.bad}`}>{ref.type.toUpperCase()} {ref.value}</span>)}
        {job.openFlags > 0 && <span className={`${styles.chip} ${job.blockFlags ? styles.bad : styles.warn}`}>{job.openFlags} {t('job.flags')}</span>}
      </div>)}
      {!shown.length && <p className={styles.muted}>No job files yet. Forward an email, photograph a paper or create one below.</p>}
    </section>
    <section className={styles.card}><h3>New job file</h3>
      <div className={styles.form}>
        <select className={styles.select} value={form.mode} onChange={event => setForm({ ...form, mode: event.target.value })} aria-label={t('job.mode')}>{MODES.map(mode => <option key={mode} value={mode}>{mode.replace('_', ' ')}</option>)}</select>
        <input className={styles.input} placeholder={t('job.client')} value={form.clientName} onChange={event => setForm({ ...form, clientName: event.target.value })} />
        <input className={styles.input} placeholder="Origin (e.g. SZX)" value={form.origin} onChange={event => setForm({ ...form, origin: event.target.value })} />
        <input className={styles.input} placeholder="Destination (e.g. DXB)" value={form.destination} onChange={event => setForm({ ...form, destination: event.target.value })} />
        <input className={styles.input} placeholder="AWB or container number" value={form.awb} onChange={event => setForm({ ...form, awb: event.target.value })} />
        <button type="button" className={styles.button} onClick={() => void create()}>Create</button>
      </div>
    </section>
  </JobShell>;
}
