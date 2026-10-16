'use client';

import { useEffect, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import styles from './intelligence-tools.module.css';

export default function FullscreenButton() {
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    update();
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  async function toggle() {
    setError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setError('Fullscreen is not supported by this browser.');
    } catch {
      setError('Fullscreen was blocked by the browser. Try its fullscreen menu.');
    }
  }
  const label = fullscreen ? 'Exit fullscreen' : 'Fullscreen';
  return <div className={styles.fullscreen}>
    <button type="button" title={label} aria-label={label} aria-pressed={fullscreen} onClick={() => void toggle()}>
      {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}<span>{label}</span>
    </button>
    {error && <span className={styles.notice} role="status">{error}<button type="button" aria-label="Dismiss fullscreen message" onClick={() => setError('')}>OK</button></span>}
  </div>;
}
