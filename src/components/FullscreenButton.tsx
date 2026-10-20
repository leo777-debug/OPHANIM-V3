'use client';

import { useEffect, useState, type RefObject } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import styles from './intelligence-tools.module.css';

export default function FullscreenButton({ targetRef, label = 'Fullscreen' }: { targetRef?: RefObject<HTMLElement | null>; label?: string }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const update = () => {
      setFullscreen(document.fullscreenElement === (targetRef?.current ?? document.documentElement));
      window.dispatchEvent(new Event('resize'));
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.fullscreenElement === (targetRef?.current ?? document.documentElement)) {
        event.preventDefault();
        void document.exitFullscreen().catch(() => setError('Could not leave fullscreen. Try the browser fullscreen control.'));
      }
    };
    update();
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('keydown', onEscape);
    return () => { document.removeEventListener('fullscreenchange', update); document.removeEventListener('keydown', onEscape); };
  }, [targetRef]);
  async function toggle() {
    setError('');
    try {
      const target = targetRef ? targetRef.current : document.documentElement;
      if (!target) { setError('The map is not ready yet. Try again.'); return; }
      if (document.fullscreenElement === target) await document.exitFullscreen();
      else if (target.requestFullscreen) await target.requestFullscreen();
      else setError('Fullscreen is not supported by this browser.');
    } catch {
      setError('Fullscreen was blocked by the browser. Try its fullscreen menu.');
    }
  }
  const buttonLabel = fullscreen ? 'Exit fullscreen' : label;
  return <div className={styles.fullscreen}>
    <button type="button" title={buttonLabel} aria-label={buttonLabel} aria-pressed={fullscreen} onClick={() => void toggle()}>
      {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}<span>{buttonLabel}</span>
    </button>
    {error && <span className={styles.notice} role="status">{error}<button type="button" aria-label="Dismiss fullscreen message" onClick={() => setError('')}>OK</button></span>}
  </div>;
}
