'use client';
import { useEffect, useState } from 'react';
import { getJson } from './api';
import JobShell from './JobShell';
import styles from './jobfile.module.css';
import { useLocale } from './useLocale';

type Item = { id: string; name: string; variables: string[]; optional?: string[]; unlocks: string; withoutKey: string; configured: boolean; missing: string[] };

/** Admin setup status: configured or stub, and which variable turns each integration on. */
export default function SetupWorkspace() {
  const locale = useLocale();
  const [items, setItems] = useState<Item[] | null>(null), [demo, setDemo] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { const controller = new AbortController(); getJson<{ integrations: Item[]; demo: boolean }>('/api/jobfiles/setup', controller.signal).then(body => { setItems(body.integrations); setDemo(body.demo); }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); }); return () => controller.abort(); }, []);
  return <JobShell demo={demo} locale={locale}>
    <section className={styles.card}><h2>Job files: setup status</h2>
      <p className={styles.muted}>Keys go only in the server environment (see .env.example). This page shows whether they are set, never their values. Every integration has a labelled stub mode.</p>
      {message && <p role="status">{message}</p>}
      {items?.map(item => <div key={item.id} className={styles.row}>
        <span className={`${styles.chip} ${item.configured ? styles.ok : styles.warn}`}>{item.configured ? 'configured' : 'stub'}</span><strong>{item.name}</strong>
        <span className={styles.muted}>{item.configured ? item.unlocks : `${item.withoutKey}. Set ${item.missing.join(', ') || item.variables.join(', ')}`}</span>
      </div>)}
    </section>
  </JobShell>;
}
