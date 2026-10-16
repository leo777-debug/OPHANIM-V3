import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readShare } from '@/lib/verify/store';
import VerifyResultCard from '@/components/verify/VerifyResultCard';
import styles from '@/components/verify/verify.module.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shared Ophanim check', robots: { index: false, follow: false } };
export default async function SharedVerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const result = await readShare(token); if (!result) notFound();
  return <main className={styles.page}><header className={styles.header}><Link href="/verify" className={styles.brand}>OPHANIM VERIFY</Link><Link href={`/api/verify/image?token=${token}`}>Download image</Link></header><div className={styles.title}><p>SHARED PUBLIC CHECK</p><h1>Evidence, at the time of checking</h1><VerifyResultCard result={result} /></div></main>;
}
