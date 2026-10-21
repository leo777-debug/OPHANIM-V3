'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { getJson, sendJson } from './api';
import FieldCrop from './FieldCrop';
import JobShell from './JobShell';
import styles from './jobfile.module.css';
import { useLocale } from './useLocale';
import type { Activity, ExtractedField, FlagRecord, Invoice, JobDocument, JobFile, JobLeg, JobMilestone, JobReference, PieceCount } from '@/lib/jobfile/types';

type Ghost = { milestoneCode: string; probability: number; label: string };
type Prediction = { id: string; questionType: string; textEn: string; madeAt: string; summary: string; status: 'pending' | 'called' | 'missed' | 'excluded'; scoreLabel?: string };
type Lesson = { checkCode: string; lessonEn: string; lessonAr: string; exampleEn: string; exampleAr: string };
type Paper = { id: string; kind: string; version: number; status: string; url: string | null };
type Chaser = { milestoneCode: string; subject: string; body: string; to: string | null; channel: string };
type View = {
  job: JobFile; references: JobReference[]; legs: JobLeg[]; milestones: JobMilestone[]; pieces: PieceCount[]; documents: Array<JobDocument & { url: string | null; fields?: ExtractedField[] }>;
  flags: FlagRecord[]; invoices: Invoice[]; activity: Activity[]; demo: boolean; ghosts?: Ghost[]; predictions?: Prediction[]; lessons?: Lesson[]; papers?: Paper[]; chasers?: Chaser[];
  milestoneLabels?: Record<string, string>; cameraPorts?: Array<{ code: string; name: string }>; events?: Array<{ title: string; label: 'FACT' | 'ESTIMATE'; detail: string }>; margin?: { revenue: number; cost: number; currency: string } | null;
};
const REF_TYPES = ['awb', 'hawb', 'bl', 'hbl', 'container', 'booking', 'invoice', 'customs_dec', 'delivery_order', 'client_ref', 'other'];
const severityClass = (severity: string) => severity === 'block' ? `${styles.flag} ${styles.flagBlock}` : severity === 'info' ? `${styles.flag} ${styles.flagInfo}` : styles.flag;

export default function JobFileDetail({ id }: { id: string }) {
  const locale = useLocale(), { t, pick } = locale;
  const [view, setView] = useState<View | null>(null), [message, setMessage] = useState(''), [lesson, setLesson] = useState<Lesson | null>(null);
  const [refForm, setRefForm] = useState({ type: 'awb', value: '' });
  const load = useCallback(async (signal?: AbortSignal) => {
    try { setView(await getJson<View>(`/api/jobfiles/${id}`, signal)); setMessage(''); } catch (error) { if (!signal?.aborted) setMessage(error instanceof Error ? error.message : 'Unavailable.'); }
  }, [id]);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => load(controller.signal)); return () => controller.abort(); }, [load]);
  const post = async (path: string, payload: unknown) => { try { const result = await sendJson<{ lesson?: Lesson }>(`/api/jobfiles/${id}${path}`, 'POST', payload); if (result.lesson) setLesson(result.lesson); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Failed.'); } };
  if (!view) return <JobShell demo={false} locale={locale}><p className={styles.muted} role="status">{message || 'Loading job file…'}</p></JobShell>;
  const { job } = view, ghosts = new Map((view.ghosts ?? []).map(ghost => [ghost.milestoneCode, ghost]));
  const label = (code: string) => view.milestoneLabels?.[code] ?? code.replace(/_/g, ' ');
  const openFlags = view.flags.filter(flag => flag.status === 'open');
  return <JobShell demo={view.demo} locale={locale}>
    {message && <p role="status" className={styles.muted}>{message}</p>}
    <section className={styles.card}>
      <h2>{t('job.title')} {job.jobNumber}{job.isSynthetic && <span className={styles.synthetic}>{t('app.synthetic')}</span>}</h2>
      <div className={styles.form}><span className={styles.chip}>{t('job.mode')}: {job.mode.replace('_', ' ')}</span><span className={styles.chip}>{t('job.status')}: {job.status}</span>
        <span className={styles.chip}>{t('job.client')}: {job.clientName ?? '—'}</span><span className={styles.chip}>{t('job.route')}: {job.origin ?? '?'} → {job.destination ?? '?'}</span>
        {job.plannedArrivalAt && <span className={styles.chip}>ETA {new Date(job.plannedArrivalAt).toLocaleString()}</span>}
        <Link href={`/capture?job=${job.id}`} className={`${styles.button} ${styles.secondary}`}>{t('capture.take')}</Link>
        <Link href={`/floor?job=${job.id}`} className={`${styles.button} ${styles.secondary}`}>Floor taps / tally</Link>
        <Link href={`/route-lens?job=${job.id}`} className={`${styles.button} ${styles.secondary}`}>Route Lens</Link>
        {(view.cameraPorts ?? []).map(port => <Link key={port.code} href={`/watchtower?port=${port.code}`} className={`${styles.button} ${styles.secondary}`}>Cameras: {port.name}</Link>)}</div>
      {(view.events ?? []).map(event => <p key={event.title} className={styles.muted}><span className={`${styles.chip} ${event.label === 'FACT' ? styles.ok : styles.warn}`}>{t(event.label === 'FACT' ? 'app.fact' : 'app.estimate')}</span> {event.title} — {event.detail}</p>)}
    </section>

    {!!view.predictions?.length && <section className={styles.card}><h3>{t('job.receipts')}</h3>
      {view.predictions.map(prediction => <div key={prediction.id} className={styles.row}>
        <span className={`${styles.chip} ${prediction.status === 'called' ? styles.ok : prediction.status === 'missed' ? styles.bad : styles.ghost}`}>{prediction.status === 'called' ? 'Called it' : prediction.status === 'missed' ? 'Missed' : prediction.status === 'excluded' ? 'Acted on (excluded)' : 'Pending'}</span>
        <span>{prediction.textEn}</span><strong>{prediction.summary}</strong>{prediction.scoreLabel && <span className={styles.muted}>{prediction.scoreLabel}</span>}
      </div>)}</section>}

    <div className={styles.grid}>
      <section className={styles.card}><h3>{t('job.keyRing')}</h3>
        {view.references.map(ref => <div key={ref.id} className={styles.row}><span className={styles.chip}>{ref.type.toUpperCase()}</span><code>{ref.normalizedValue}</code>
          <span className={`${styles.chip} ${ref.validated ? styles.ok : styles.bad}`}>{ref.validated ? t('job.valid') : `${t('job.invalid')} (${ref.validationCode})`}</span><span className={styles.muted}>{ref.source}</span></div>)}
        <div className={styles.form}><select className={styles.select} value={refForm.type} onChange={event => setRefForm({ ...refForm, type: event.target.value })} aria-label="Reference type">{REF_TYPES.map(type => <option key={type}>{type}</option>)}</select>
          <input className={styles.input} value={refForm.value} onChange={event => setRefForm({ ...refForm, value: event.target.value })} placeholder="Reference number" />
          <button type="button" className={styles.button} onClick={() => void post('/references', refForm).then(() => setRefForm({ ...refForm, value: '' }))}>Add</button></div>
      </section>

      <section className={styles.card}><h3>{t('job.timeline')}</h3>
        <ol className={styles.timeline}>{view.milestones.map(milestone => { const ghost = ghosts.get(milestone.code); return <li key={milestone.id}>
          <span className={`${styles.dot} ${milestone.actualAt ? styles.dotDone : ghost ? styles.dotGhost : ''}`} />
          <span>{label(milestone.code)}{milestone.needsConfirmation && <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => void post('/milestones', { code: milestone.code, action: 'confirm' })}>{t('desk.confirm')}</button>}
            {ghost && !milestone.actualAt && <span className={`${styles.chip} ${styles.ghost}`}>{t('ghost.badge', { pct: Math.round(ghost.probability * 100) })}</span>}</span>
          <span className={styles.muted}>{milestone.actualAt ? new Date(milestone.actualAt).toLocaleString() : milestone.expectedAt ? `exp. ${new Date(milestone.expectedAt).toLocaleString()}` : milestone.plannedAt ? `plan ${new Date(milestone.plannedAt).toLocaleString()}` : ''}{milestone.source ? ` · ${milestone.source}` : ''}</span>
        </li>; })}</ol>
        {!view.milestones.length && <p className={styles.muted}>No milestones yet.</p>}
        {(view.chasers ?? []).map(chaser => <details key={chaser.milestoneCode} className={styles.flag}><summary>Chaser drafted: {chaser.subject}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{chaser.body}</pre>
          <p className={styles.actions}>{chaser.to && <a className={styles.button} href={`mailto:${encodeURIComponent(chaser.to)}?subject=${encodeURIComponent(chaser.subject)}&body=${encodeURIComponent(chaser.body)}`}>Email</a>}
            <a className={`${styles.button} ${styles.secondary}`} href={`https://wa.me/?text=${encodeURIComponent(`${chaser.subject}\n\n${chaser.body}`)}`} target="_blank" rel="noreferrer">WhatsApp</a></p></details>)}
      </section>

      <section className={styles.card}><h3>{t('job.pieces')}</h3>
        {view.pieces.map(count => <div key={count.id} className={styles.row}><span className={styles.chip}>{count.handoff.replace('_', ' ')}</span><strong>{count.pieces} pcs</strong>{count.weightKg !== null && <span>{count.weightKg} kg</span>}<span className={styles.muted}>{count.source} · {new Date(count.recordedAt).toLocaleString()}</span></div>)}
        {!view.pieces.length && <p className={styles.muted}>No counts recorded.</p>}
      </section>

      <section className={styles.card}><h3>{t('job.legs')}</h3>
        {view.legs.map(leg => <div key={leg.id} className={styles.row}><span className={styles.chip}>{leg.mode}</span><span>{leg.fromLocation} → {leg.toLocation}</span><span className={styles.muted}>{leg.carrier} {leg.transportRef}</span></div>)}
        {!view.legs.length && <p className={styles.muted}>No legs yet.</p>}
      </section>
    </div>

    <section className={styles.card}><h3>{t('job.flags')} ({openFlags.length})</h3>
      {!openFlags.length && <p className={styles.muted}>{t('job.noFlags')}</p>}
      {openFlags.map(flag => <article key={flag.id} className={severityClass(flag.severity)}>
        <p><span className={`${styles.chip} ${flag.severity === 'block' ? styles.bad : flag.severity === 'info' ? styles.info : styles.warn}`}>{flag.severity}</span> <strong>{pick(flag.messageEn, flag.messageAr)}</strong></p>
        <p className={styles.muted}>{pick(flag.whyEn, flag.whyAr)}</p><p>→ {pick(flag.fixEn, flag.fixAr)}</p>
        <p className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => void post('/flags', { flagId: flag.id, status: 'fixed' })}>Fixed</button>
          <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => void post('/flags', { flagId: flag.id, status: 'accepted_difference' })}>Accept difference (remember for this client)</button>
          <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => void post('/flags', { flagId: flag.id, status: 'false_alarm' })}>False alarm</button>
        </p>
      </article>)}
      {lesson && <aside className={styles.banner} role="status"><strong>{t('desk.lesson')}:</strong> {pick(lesson.lessonEn, lesson.lessonAr)} {pick(lesson.exampleEn, lesson.exampleAr) && <em>— {pick(lesson.exampleEn, lesson.exampleAr)}</em>} <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setLesson(null)}>OK</button></aside>}
    </section>

    <section className={styles.card}><h3>{t('job.documents')} ({view.documents.length})</h3>
      {view.documents.map(document => <details key={document.id} className={styles.flag} open={Boolean(document.fields?.some(field => field.status === 'suggested'))}>
        <summary><strong>{document.docTypeCode?.replace(/_/g, ' ') ?? 'document'}</strong> · {document.originalFileName} · v{document.versionNumber} · {document.receivedVia} {document.url && <a href={document.url} target="_blank" rel="noreferrer">open</a>}{document.reader === 'tesseract' && <span className={`${styles.chip} ${styles.warn}`}>{t('desk.lowConfidence')}</span>}</summary>
        {(document.fields ?? []).map(field => <div key={field.id} className={styles.fieldRow}>
          <span>{field.field.replace(/_/g, ' ')}</span>
          <span><strong>{field.value}</strong> <span className={styles.muted}>{Math.round(field.confidence * 100)}% · {field.status === 'auto_accepted' ? t('desk.autoAccepted') : field.status}</span><FieldCrop url={document.url} mimeType={document.mimeType} bbox={field.bbox} page={field.page} /></span>
          {field.status === 'suggested' ? <span className={styles.actions}><button type="button" className={styles.button} onClick={() => void post('/fields', { fieldId: field.id, action: 'confirm' })}>{t('desk.confirm')}</button>
            <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => { const value = window.prompt(t('desk.correct'), field.value ?? ''); if (value !== null) void post('/fields', { fieldId: field.id, action: 'correct', value }); }}>{t('desk.correct')}</button></span> : <span />}
        </div>)}
      </details>)}
      {(view.papers ?? []).map(paper => <div key={paper.id} className={styles.row}><span className={styles.chip}>{paper.kind.replace('_', ' ')} v{paper.version}</span><span className={`${styles.chip} ${paper.status === 'approved' ? styles.ok : styles.warn}`}>{paper.status}</span>{paper.url && <a href={paper.url} target="_blank" rel="noreferrer">PDF</a>}
        {paper.status === 'draft' && <button type="button" className={styles.button} onClick={() => void post('/papers', { action: 'approve', paperId: paper.id })}>Approve</button>}</div>)}
      <p className={styles.actions}>{['house_awb', 'delivery_note', 'client_invoice'].map(kind => <button key={kind} type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => void post('/papers', { action: 'draft', kind })}>Draft {kind.replace('_', ' ')}</button>)}</p>
    </section>

    <section className={styles.card}><h3>{t('job.invoices')}</h3>
      {view.invoices.map(invoice => <div key={invoice.id} className={styles.row}><span className={styles.chip}>{invoice.direction}</span><strong>{invoice.currency} {invoice.total.toFixed(2)}</strong><span>{invoice.counterpartyName}</span><span className={styles.chip}>{invoice.status}</span><span className={styles.muted}>e-invoice: {invoice.einvoiceStatus}{invoice.delayCostKind ? ` · delay cost: ${invoice.delayCostKind}` : ''}</span>
        {invoice.direction === 'outgoing' && <a href={`/api/jobfiles/${job.id}/invoices/${invoice.id}/pint-ae`}>PINT AE (stub)</a>}</div>)}
      {view.margin && <p>Margin: {view.margin.currency} {(view.margin.revenue - view.margin.cost).toFixed(2)} (revenue {view.margin.revenue.toFixed(2)} − cost {view.margin.cost.toFixed(2)})</p>}
      <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => void post('/invoices', { action: 'draft' })}>Draft client invoice</button>
    </section>

    <section className={styles.card}><h3>{t('job.activity')}</h3>
      {view.activity.slice(0, 40).map(entry => <div key={entry.id} className={styles.row}><span className={styles.muted}>{new Date(entry.createdAt).toLocaleString()}</span><span>{entry.action}</span></div>)}
    </section>
  </JobShell>;
}
