import type { Metadata, Viewport } from 'next';
import DriverWorkspace from '@/components/jobfile/DriverWorkspace';
export const metadata: Metadata = { title: 'Trip · Ophanim', robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };
export default async function DriverPage({ params }: { params: Promise<{ token: string }> }) {
  return <main style={{ minHeight: '100vh', background: '#0b1117', color: '#e6eef5' }}><DriverWorkspace token={(await params).token} /></main>;
}
