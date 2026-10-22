import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a local recovery server run independently from a stale development process.
  distDir: process.env.NEXT_DEV_DIST_DIR || '.next',
  // Vercel's adapter generates its own output; Docker needs the standalone server.
  output: process.env.VERCEL ? undefined : 'standalone',
  serverExternalPackages: ['ws'],
  transpilePackages: ['react-map-gl', 'mapbox-gl', 'maplibre-gl'],
  turbopack: {
    // MapLibre 6 builds a blob URL from `new URL(dynamic, import.meta.url)`, used only for
    // cross-origin worker URLs. Ours is same-origin (set in OphanimMap), so that path never
    // runs. Turbopack builds are required on Vercel: its adapter merges routes into shared
    // functions only from Turbopack's file hashes (webpack builds exceed the function limit).
    ignoreIssue: [{ path: /node_modules[\\/]maplibre-gl[\\/]dist[\\/]maplibre-gl\.mjs$/, title: /Module not found/ }],
  },
  experimental: {
    // OneDrive can drop Turbopack's persistent cache while files are syncing.
    turbopackFileSystemCacheForDev: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: wss: data: blob:;" },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },
};

export default nextConfig;
