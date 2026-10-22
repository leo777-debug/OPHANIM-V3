'use client';
import { useEffect, useSyncExternalStore } from 'react';

function subscribe(listener: () => void) {
  window.addEventListener('online', listener); window.addEventListener('offline', listener);
  return () => { window.removeEventListener('online', listener); window.removeEventListener('offline', listener); };
}
const offlineSnapshot = () => !navigator.onLine;
const serverSnapshot = () => false;

export default function OfflineShell() {
  const offline = useSyncExternalStore(subscribe, offlineSnapshot, serverSnapshot);
  useEffect(() => {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    }
  }, []);
  return offline ? <aside role="status" style={{ position: 'fixed', bottom: 12, insetInlineStart: 12, zIndex: 9999, maxWidth: '90vw', padding: 12, background: '#19252d', color: '#fff', border: '1px solid #fbbf24' }}>Offline — displayed data may be outdated. <a href="/offline.html" style={{ color: '#7cffcb' }}>Open saved public snapshot</a></aside> : null;
}
