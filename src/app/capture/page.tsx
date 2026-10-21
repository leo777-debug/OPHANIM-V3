import type { Metadata, Viewport } from 'next';
import CaptureWorkspace from '@/components/jobfile/CaptureWorkspace';
export const metadata: Metadata = { title: 'Photograph paper · Ophanim' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };
/** Phone page: no app install, works in the browser, queues uploads offline. */
export default async function CapturePage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const job = (await searchParams).job;
  return <main style={{ minHeight: '100vh', background: '#0b1117', color: '#e6eef5' }}><CaptureWorkspace jobFileId={job && /^[0-9a-f-]{36}$/i.test(job) ? job : null} /></main>;
}
