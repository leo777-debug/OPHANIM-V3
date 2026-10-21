import type { Metadata, Viewport } from 'next';
import FloorWorkspace from '@/components/jobfile/FloorWorkspace';
export const metadata: Metadata = { title: 'Floor taps · Ophanim' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };
/** Phone page for warehouse and floor staff. No app install. */
export default async function FloorPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const job = (await searchParams).job;
  return <main style={{ minHeight: '100vh', background: '#0b1117', color: '#e6eef5' }}>{job && /^[0-9a-f-]{36}$/i.test(job) ? <FloorWorkspace jobFileId={job} /> : <p style={{ padding: 16 }}>Open this page from a job file (Floor taps link).</p>}</main>;
}
