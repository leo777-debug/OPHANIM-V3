'use client';
import { useCallback, useEffect, useState } from 'react';
import { direction, isLocale, t as translate, type Locale } from '@/lib/i18n';

const KEY = 'ophanim-locale';
/** English/Arabic toggle remembered per browser; Arabic switches the page to right-to-left. */
export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>('en');
  useEffect(() => { try { const saved = localStorage.getItem(KEY); if (isLocale(saved)) void Promise.resolve().then(() => setLocaleState(saved)); } catch { /* Storage unavailable: keep English. */ } }, []);
  const setLocale = useCallback((next: Locale) => { setLocaleState(next); try { localStorage.setItem(KEY, next); } catch { /* Not persisted. */ } }, []);
  const t = useCallback((key: string, params?: Record<string, string | number>) => translate(locale, key, params), [locale]);
  return { locale, setLocale, t, dir: direction(locale) as 'ltr' | 'rtl', pick: <T,>(en: T, ar: T) => locale === 'ar' ? ar : en };
}
