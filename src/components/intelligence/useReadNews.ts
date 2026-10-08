'use client';

import { useMemo, useSyncExternalStore } from 'react';

const KEY = 'ophanim.news.read.v1';
const EVENT = 'ophanim-news-read';
let fallback = '';
function snapshot() {
  try { return window.localStorage.getItem(KEY) ?? fallback; } catch { return fallback; }
}
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(EVENT, callback);
  };
}
function decode(value: string): string[] {
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}
export function useReadNews() {
  const value = useSyncExternalStore(subscribe, snapshot, () => '');
  const seen = useMemo(() => new Set(decode(value)), [value]);
  const markRead = (ids: string[]) => {
    fallback = JSON.stringify([...new Set([...decode(snapshot()), ...ids])].slice(-2000));
    try { window.localStorage.setItem(KEY, fallback); } catch { /* Keep session activity when storage is blocked. */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return { seen, markRead };
}
