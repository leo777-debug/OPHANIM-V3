'use client';
import { useEffect, useState } from 'react';
import { getJson } from './api';
import JobShell from './JobShell';
import styles from './jobfile.module.css';
import { useLocale } from './useLocale';
import type { Calibration } from '@/lib/jobfile/receipts';

/** Reliability diagram: predicted probability (x) vs observed frequency (y); the diagonal is perfect calibration. */
function CalibrationChart({ data }: { data: Calibration }) {
  const size = 240, pad = 34, plot = size - pad * 1.5, x = (value: number) => pad + value * plot, y = (value: number) => size - pad - value * plot, max = Math.max(1, ...data.bins.map(bin => bin.n));
  return <svg className={styles.chart} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Calibration chart for ${data.questionType}`}>
    <rect x={pad} y={y(1)} width={plot} height={plot} fill="none" stroke="#2a3744" />
    {[0.25, 0.5, 0.75].map(tick => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={y(0)} y2={y(1)} stroke="#1f2a35" /><line x1={x(0)} x2={x(1)} y1={y(tick)} y2={y(tick)} stroke="#1f2a35" /></g>)}
    <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="#6b7c8c" strokeDasharray="4 4" strokeWidth={1} />
    {data.bins.length > 1 && <polyline fill="none" stroke="#2fd5ca" strokeWidth={2} points={data.bins.map(bin => `${x(bin.meanPredicted)},${y(bin.observed)}`).join(' ')} />}
    {data.bins.map(bin => <circle key={bin.from} cx={x(bin.meanPredicted)} cy={y(bin.observed)} r={4 + 6 * bin.n / max} fill="#2fd5ca" stroke="#131b24" strokeWidth={2}>
      <title>{`Predicted ${(bin.meanPredicted * 100).toFixed(0)}% · happened ${(bin.observed * 100).toFixed(0)}% · ${bin.n} prediction${bin.n === 1 ? '' : 's'}`}</title></circle>)}
    {[0, 0.5, 1].map(tick => <g key={`l${tick}`} fill="#8a9bab" fontSize={9}><text x={x(tick)} y={size - pad + 14} textAnchor="middle">{tick * 100}%</text><text x={pad - 6} y={y(tick) + 3} textAnchor="end">{tick * 100}%</text></g>)}
    <text x={pad + plot / 2} y={size - 4} textAnchor="middle" fill="#8a9bab" fontSize={9}>predicted</text>
    <text x={10} y={y(0.5)} transform={`rotate(-90 10 ${y(0.5)})`} textAnchor="middle" fill="#8a9bab" fontSize={9}>happened</text>
  </svg>;
}

export default function ReceiptsWorkspace() {
  const locale = useLocale();
  const [types, setTypes] = useState<Calibration[] | null>(null), [demo, setDemo] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { const controller = new AbortController(); getJson<{ types: Calibration[]; demo: boolean }>('/api/jobfiles/receipts', controller.signal).then(body => { setTypes(body.types); setDemo(body.demo); }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); }); return () => controller.abort(); }, []);
  return <JobShell demo={demo} locale={locale}>
    <section className={styles.card}><h2>Checking our work</h2>
      <p className={styles.muted}>Every prediction is recorded when made and scored when the truth arrives. Brier score: lower is better (0 = perfect). Baseline = always predicting the observed base rate. Warnings that someone acted on, where the problem then did not happen, are excluded from calibration. Small samples are not evidence of accuracy.</p>
      {message && <p role="status">{message}</p>}
      {types && !types.length && <p className={styles.muted}>No resolved predictions yet.</p>}
    </section>
    <div className={styles.grid}>{types?.map(type => <section key={type.questionType} className={styles.card}>
      <h3>{type.questionType.replace(/_/g, ' ')}</h3>
      <p className={styles.muted}>{type.resolved} resolved · {type.excluded} excluded (intervention){type.brier !== null && <> · Brier <strong>{type.brier.toFixed(3)}</strong> vs baseline {type.baselineBrier?.toFixed(3)}</>}{type.coverage !== null && <> · 80% ranges contained {(type.coverage * 100).toFixed(0)}% of outcomes ({type.intervals})</>}</p>
      {type.bins.length > 0 && <CalibrationChart data={type} />}
      {type.bins.length > 0 && <table className={styles.muted}><thead><tr><th>Predicted</th><th>Happened</th><th>n</th></tr></thead><tbody>{type.bins.map(bin => <tr key={bin.from}><td>{(bin.meanPredicted * 100).toFixed(0)}%</td><td>{(bin.observed * 100).toFixed(0)}%</td><td>{bin.n}</td></tr>)}</tbody></table>}
    </section>)}</div>
  </JobShell>;
}
