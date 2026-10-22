import type { Metadata } from 'next';
import OphanimLanding from '@/components/landing/OphanimLanding';

export const metadata: Metadata = {
  title: "Ophanim — Know what could delay your shipments",
  description: "Ophanim helps shipping teams see which storms, port closures, and other problems could delay their shipments. Join the waitlist.",
  alternates: { canonical: '/' },
  openGraph: {
    title: "Ophanim — Know what could delay your shipments",
    description: "Ophanim helps shipping teams see which storms, port closures, and other problems could delay their shipments. Join the waitlist.",
    url: '/',
    siteName: 'Ophanim',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: "Ophanim — shipment alerts for shipping teams" }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Ophanim — Know what could delay your shipments",
    description: "Ophanim helps shipping teams see which storms, port closures, and other problems could delay their shipments. Join the waitlist.",
    images: ['/og.png'],
  },
};

export default function LandingPage() {
  return <OphanimLanding />;
}
