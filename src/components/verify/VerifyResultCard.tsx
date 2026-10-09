import { CheckCircle2, XCircle, MinusCircle, ExternalLink } from 'lucide-react';
import type { VerifyResult } from '@/lib/verify/types';
import type { SharedResult } from '@/lib/verify/store';
import styles from './verify.module.css';

export default function VerifyResultCard({ result }: { result: VerifyResult | SharedResult }) {
  return <article className={styles.result} aria-label="Verification result">
    {result.replay && <p className={styles.replay}>Replay of a synthetic test fixture at {result.replay.recordedAt}. Not a live or historical real-world finding.</p>}
    <div className={styles.resultHeading}><span className={styles.verdict} data-verdict={result.verdict}>{result.verdict}</span><time dateTime={result.checkedAt}>Checked {result.checkedAt}</time></div>
    <h2>{result.claim.text}</h2><p>{result.summary}</p>
    {'aiSummary' in result && result.aiSummary && <p className={styles.inference}><strong>INFERENCE</strong> {result.aiSummary.text}</p>}
    <dl className={styles.claimDetails}><div><dt>Type</dt><dd>{result.claim.type}</dd></div><div><dt>Place</dt><dd>{result.claim.place.name || 'Unresolved'} {result.claim.place.code}</dd></div><div><dt>Time window</dt><dd>{result.claim.start} to {result.claim.end}</dd></div><div><dt>Entities</dt><dd>{result.claim.entities.join(', ') || 'None specified'}</dd></div></dl>
    <h3>Evidence <span>{result.evidence.length}</span></h3>
    {!result.evidence.length && <p className={styles.muted}>No matching evidence returned. An empty result is not proof that the event did not happen.</p>}
    <ul className={styles.evidence}>{result.evidence.map((item) => <li key={item.id}>
      <div className={styles.evidenceIcon} data-stance={item.stance}>{item.stance === 'supports' ? <CheckCircle2 aria-label="Supports" /> : item.stance === 'contradicts' ? <XCircle aria-label="Contradicts" /> : <MinusCircle aria-label="Neutral" />}</div>
      <div><strong>{item.source}</strong><span className={styles.tier}>{item.trust.replaceAll('_', ' ')}</span><p>{item.statement}</p><small>Observed {item.observedAt}<br />Fetched {item.fetchedAt}</small>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Source <ExternalLink size={13} /></a>}</div>
    </li>)}</ul>
    <div className={styles.coverage}><section><h3>What we checked</h3>{result.checked.length ? <ul>{result.checked.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No source checks were needed or available.</p>}</section><section><h3>What we couldn&apos;t check</h3>{result.couldNotCheck.length ? <ul>{result.couldNotCheck.map((item, index) => <li key={index}><strong>{item.source}</strong>: {item.reason}</li>)}</ul> : <p>No additional missing sources recorded for this check.</p>}</section></div>
    <p className={styles.muted}>This finding covers only the stated sources, place and time window. Results can change as new evidence arrives.</p>
  </article>;
}
