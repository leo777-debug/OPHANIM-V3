'use client';
import { useEffect, useRef, useState } from 'react';
import styles from '../jobfile/jobfile.module.css';
import type { CameraFeed } from '@/lib/watchtower/cameras';

const age = (iso: string | null) => { if (!iso) return 'never seen online'; const minutes = Math.round((Date.now() - Date.parse(iso)) / 6e4); return minutes < 60 ? `online ${minutes} min ago` : minutes < 2880 ? `online ${Math.round(minutes / 60)} h ago` : `online ${Math.round(minutes / 1440)} days ago`; };

function Player({ feed }: { feed: CameraFeed }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (feed.embedType !== 'hls' || !feed.streamUrl || !video.current) return;
    const element = video.current;
    if (element.canPlayType('application/vnd.apple.mpegurl')) { element.src = feed.streamUrl; return; }
    let destroy: (() => void) | undefined;
    void import('hls.js').then(({ default: Hls }) => { if (!Hls.isSupported()) return; const hls = new Hls({ maxBufferLength: 10 }); hls.loadSource(feed.streamUrl!); hls.attachMedia(element); destroy = () => hls.destroy(); });
    return () => destroy?.();
  }, [feed]);
  if (!feed.streamUrl) return <div className={styles.banner}>No live view: lead only. {feed.note}</div>;
  if (feed.embedType === 'hls') return <video ref={video} muted autoPlay playsInline controls style={{ width: '100%', aspectRatio: '16 / 9', background: '#000' }} />;
  if (feed.embedType === 'snapshot' || feed.embedType === 'mjpeg') {
    // Public snapshot/MJPEG images are displayed as published, never re-streamed.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={feed.streamUrl} alt={feed.name} style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', background: '#000' }} referrerPolicy="no-referrer" />;
  }
  const src = feed.embedType === 'youtube' ? feed.streamUrl.replace('watch?v=', 'embed/').replace('youtube.com', 'youtube-nocookie.com') : feed.streamUrl;
  return <iframe src={src} title={feed.name} style={{ width: '100%', aspectRatio: '16 / 9', border: 0, background: '#000' }} allow="autoplay; fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="no-referrer" loading="lazy" />;
}

/** One camera tile with distance and last-online badges; click to view full screen. */
export default function CameraTile({ feed }: { feed: CameraFeed }) {
  const [full, setFull] = useState(false);
  const badge = feed.status === 'live' ? styles.ok : feed.status === 'dead' ? styles.bad : feed.status === 'unverified' ? styles.ghost : styles.warn;
  return <article className={styles.card} style={full ? { position: 'fixed', inset: 16, zIndex: 50, overflow: 'auto' } : undefined}>
    <p className={styles.form}><span className={`${styles.chip} ${badge}`}>{feed.status}</span><span className={styles.chip}>{feed.type}</span>{feed.distanceKm !== null && <span className={styles.chip}>{feed.distanceKm} km from port</span>}<span className={styles.muted}>{age(feed.lastSeen)}</span></p>
    <h3>{feed.name}</h3>
    <Player feed={feed} />
    <p className={styles.muted}>Source: <a href={feed.sourceUrl} target="_blank" rel="noreferrer">{new URL(feed.sourceUrl).hostname}</a> · Terms: {feed.terms}</p>
    {feed.streamUrl && <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setFull(value => !value)}>{full ? 'Close' : 'Full screen'}</button>}
  </article>;
}
