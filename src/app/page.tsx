import type { Metadata } from 'next';
import OphanimLanding from '@/components/landing/OphanimLanding';

export const metadata: Metadata = {
  title: 'Shrafim — Ophanim logistics intelligence',
  description: 'Shrafim builds intelligence products for complex operations. Ophanim is its logistics product, connecting global disruptions to the shipments they may affect.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Shrafim — Ophanim logistics intelligence',
    description: 'Meet Ophanim, the logistics intelligence product from Shrafim.',
    url: '/',
    siteName: 'Shrafim',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Ophanim operational intelligence for logistics teams' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Shrafim — Ophanim logistics intelligence',
    description: 'Meet Ophanim, the logistics intelligence product from Shrafim.',
    images: ['/og.png'],
  },
};

export default function LandingPage() {
  return <OphanimLanding />;
}
