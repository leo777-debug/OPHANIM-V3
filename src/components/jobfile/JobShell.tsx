'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './jobfile.module.css';
import { useLocale } from './useLocale';

/** Language toggle, demo banner and job-file sub-navigation shared by every job-file screen. */
export default function JobShell({ demo, children, locale }: { demo: boolean; children: ReactNode; locale: ReturnType<typeof useLocale> }) {
  const { t, setLocale, dir } = locale;
  return <div className={styles.page} dir={dir} lang={locale.locale}>
    <div className={styles.toolbar}>
      <nav className={styles.form}>
        <Link href="/jobs">{t('job.list')}</Link><Link href="/jobs/today">{t('today.title')}</Link><Link href="/jobs/review">{t('review.title')}</Link>
        <Link href="/jobs/desk">{t('desk.title')}</Link><Link href="/capture">{t('capture.title')}</Link><Link href="/jobs/receipts">{t('job.receipts')}</Link>
      </nav>
      <label className={styles.muted}>{t('app.language')}{' '}
        <select className={styles.select} value={locale.locale} onChange={event => setLocale(event.target.value === 'ar' ? 'ar' : 'en')}><option value="en">English</option><option value="ar">العربية</option></select>
      </label>
    </div>
    {demo && <p className={styles.banner} role="status">{t('app.demoMode')}</p>}
    {children}
  </div>;
}
