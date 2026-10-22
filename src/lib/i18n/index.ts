// Interface and flag strings live in per-language files so Hindi and Urdu can be
// added by dropping in another JSON file and listing it here.
import en from './messages/en.json' with { type: 'json' };
import ar from './messages/ar.json' with { type: 'json' };

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const RTL_LOCALES: readonly Locale[] = ['ar'];
const catalogs: Record<Locale, Record<string, string>> = { en, ar };

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale);
export const direction = (locale: Locale) => RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';

/** Missing keys fall back to English, then to the key itself, so a gap never crashes a page. */
export function t(locale: Locale, key: string, params: Record<string, string | number> = {}): string {
  const template = catalogs[locale][key] ?? catalogs.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => name in params ? String(params[name]) : whole);
}
export const both = (key: string, params?: Record<string, string | number>) => ({ en: t('en', key, params), ar: t('ar', key, params) });
export const keys = (locale: Locale) => Object.keys(catalogs[locale]);
