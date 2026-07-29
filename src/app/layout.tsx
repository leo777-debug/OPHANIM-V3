import type { Metadata, Viewport } from "next";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./globals.css";

const SITE_URL = "https://ophanim.live";
const SITE_NAME = "OPHANIM";
const SITE_TITLE = "OPHANIM - Live Intelligence Atlas | Flights, CCTV, OSINT Tools & Global Risk";
const SITE_DESCRIPTION =
  "A modern open-source intelligence atlas for live flight tracking, satellites, maritime activity, public CCTV, severe weather, cyber threats, financial signals, and browser-based OSINT tools.";

export const viewport: Viewport = {
  themeColor: "#7CFFCB",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | OPHANIM Intelligence",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "OSINT tools",
    "open source intelligence",
    "intelligence atlas",
    "geospatial intelligence",
    "real-time tracking",
    "flight tracker",
    "satellite tracking",
    "CCTV cameras live",
    "earthquake monitor",
    "wildfire tracker",
    "cyber threats dashboard",
    "weather alerts",
    "DNS lookup",
    "WHOIS lookup",
    "BGP routing lookup",
    "IP geolocation",
    "threat intelligence",
    "ophanim",
    "ophanim intelligence",
  ],
  authors: [{ name: "Ophanim Project", url: SITE_URL }],
  creator: "Ophanim Project",
  publisher: "Ophanim Project",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/android-chrome-512x512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: "/favicon.ico",
    other: [
      {
        rel: "apple-touch-icon-precomposed",
        url: "/apple-touch-icon.png",
      },
    ],
  },
  manifest: "/site.webmanifest",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: SITE_URL,
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "OPHANIM live intelligence atlas with map layers and OSINT tools",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
  },
  category: "technology",
  classification: "Intelligence & Security",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": SITE_NAME,
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#081011",
    "msapplication-config": "none",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "OPHANIM - OSINT Toolkit & Live Intelligence Atlas",
  alternateName: ["OPHANIM", "Ophanim Intelligence", "Ophanim Atlas"],
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "SecurityApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires a modern web browser",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
  featureList: [
    "Browser-based OSINT toolkit",
    "DNS, WHOIS, BGP, certificate, CVE, and IP intelligence lookups",
    "Real-time flight, maritime, satellite, CCTV, hazard, market, and cyber layers",
    "Interactive 3D globe with day/night cycle and regional dossiers",
  ],
  screenshot: `${SITE_URL}/og-image.png`,
  author: {
    "@type": "Organization",
    name: "Ophanim Project",
    url: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="canonical" href={SITE_URL} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased">
        <ErrorBoundary name="OPHANIM Core">{children}</ErrorBoundary>
      </body>
    </html>
  );
}
