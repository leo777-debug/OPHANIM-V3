import type { Metadata, Viewport } from "next";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./globals.css";

const SITE_URL = "https://ophanim.live";
const SITE_NAME = "Ophanim";
const SITE_TITLE = "Ophanim — Operational intelligence for logistics teams";
const SITE_DESCRIPTION =
  "Ophanim connects your shipments, email and documents with maritime, cyber, environmental and open-source intelligence—then surfaces only what matters.";

export const viewport: Viewport = {
  themeColor: "#f4f2ec",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | Ophanim Intelligence",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "operational intelligence",
    "logistics intelligence",
    "maritime intelligence",
    "shipment risk monitoring",
    "supply chain intelligence",
    "OSINT for logistics",
    "cyber threat intelligence",
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
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
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
        url: `${SITE_URL}/og.png`,
        width: 1200,
        height: 630,
        alt: "Ophanim operational intelligence for logistics teams",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [`${SITE_URL}/og.png`],
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
  name: "Ophanim — Operational intelligence for logistics teams",
  alternateName: ["Ophanim", "Ophanim Intelligence", "Ophanim Atlas"],
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires a modern web browser",
  featureList: [
    "Outside-world intelligence correlated to real logistics operations",
    "Maritime, environmental, cyber, threat, and open-source intelligence packs",
    "Evidence-backed ACT NOW and WATCH findings",
    "Operational search across company context and installed intelligence sources",
  ],
  screenshot: `${SITE_URL}/og.png`,
  author: {
    "@type": "Organization",
    name: "Ophanim Project",
    url: SITE_URL,
  },
};

const transientTimeoutGuard = `(function () {
  function isExpectedMapTileAbort(reason) {
    if (!reason || typeof reason !== 'object') return false;
    var name = reason.name;
    var message = reason.message;
    return (name === 'TimeoutError' || name === 'AbortError')
      && typeof message === 'string'
      && /signal timed out|request was aborted|signal is aborted without reason/i.test(message);
  }

  function suppressExpectedMapTileAbort(event) {
    var reason = event && (event.reason || event.error);
    if (!isExpectedMapTileAbort(reason)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  window.addEventListener('unhandledrejection', suppressExpectedMapTileAbort, true);
  window.addEventListener('error', suppressExpectedMapTileAbort, true);
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: transientTimeoutGuard }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="canonical" href={SITE_URL} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ErrorBoundary name="Ophanim Core">{children}</ErrorBoundary>
      </body>
    </html>
  );
}
