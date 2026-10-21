'use client';
import { useEffect, useMemo, useState } from 'react';
import styles from '../jobfile/jobfile.module.css';
import CameraTile from './CameraTile';
import LensMap from './LensMap';
import type { PortCameras, Port } from '@/lib/watchtower/cameras';

/** Search a port or area, see its public cameras on the map and as live tiles. */
export default function WatchtowerWorkspace({ initialPort }: { initialPort: string | null }) {
  const [query, setQuery] = useState(''), [ports, setPorts] = useState<Port[]>([]), [policy, setPolicy] = useState(''), [selected, setSelected] = useState<string | null>(initialPort), [cameras, setCameras] = useState<PortCameras | null>(null), [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController(), timer = window.setTimeout(() => {
      fetch(`/api/watchtower?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(response => response.json()).then(body => { setPorts(body.ports ?? []); setPolicy(body.policy ?? ''); }).catch(() => { if (!controller.signal.aborted) setMessage('Camera search unavailable.'); });
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(`/api/watchtower?port=${encodeURIComponent(selected)}`, { signal: controller.signal }).then(response => response.json()).then(body => { if (body.error) setMessage(body.error); else setCameras(body); }).catch(() => { if (!controller.signal.aborted) setMessage('Cameras unavailable.'); });
    return () => controller.abort();
  }, [selected]);
  const points = useMemo(() => [
    ...ports.map(port => ({ id: port.code, lon: port.lon, lat: port.lat, label: port.name, color: port.code === selected ? '#f3c56b' : '#2fd5ca', layer: 'port' })),
    ...(cameras?.feeds ?? []).filter(feed => feed.lat !== null && feed.lon !== null).map(feed => ({ id: `cam:${feed.id}`, lon: feed.lon!, lat: feed.lat!, label: feed.name, color: feed.status === 'live' ? '#7ee0b5' : '#8a9bab', layer: 'camera' })),
  ], [ports, cameras, selected]);
  return <div className={styles.page}>
    <section className={styles.card}><h2>Watchtower: public port cameras</h2>
      <p className={styles.muted}>{policy}</p>
      <p className={styles.banner}>Camera views are best-effort. Feeds at state-run ports come and go. An empty, stale or calm picture is never an &ldquo;all clear&rdquo;.</p>
      <input className={styles.input} value={query} onChange={event => setQuery(event.target.value)} placeholder="Port or area: Bandar Abbas, Fujairah anchorage, Jebel Ali gate…" aria-label="Search ports" style={{ width: '100%' }} />
      <div className={styles.form}>{ports.map(port => <button key={port.code} type="button" className={`${styles.button} ${port.code === selected ? '' : styles.secondary}`} onClick={() => setSelected(port.code)}>{port.name}</button>)}</div>
    </section>
    <LensMap points={points} onPick={id => { if (!id.startsWith('cam:')) setSelected(id); }} />
    {message && <p role="status" className={styles.muted}>{message}</p>}
    {cameras && <section className={styles.card}><h2>{cameras.port.name} · {cameras.live} live of {cameras.feeds.length}</h2>
      {cameras.warnings.map(warning => <p key={warning} className={styles.banner}>{warning}</p>)}
      <div className={styles.grid}>{cameras.feeds.map(feed => <CameraTile key={feed.id} feed={feed} />)}</div>
    </section>}
  </div>;
}
