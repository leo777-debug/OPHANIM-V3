import type { NextConfig } from "next";
import { resolve } from 'node:path';

const nextConfig: NextConfig = {
  // Lets a local recovery server run independently from a stale development process.
  distDir: process.env.NEXT_DEV_DIST_DIR || '.next',
  output: 'standalone',
  serverExternalPackages: ['ws'],
  transpilePackages: ['react-map-gl', 'mapbox-gl', 'maplibre-gl'],
  turbopack: {
    rules: {
      '**/maplibre-gl/dist/maplibre-gl.mjs': {
        loaders: ['./tools/maplibre-worker-loader.cjs'],
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /maplibre-gl\.mjs$/,
      include: /node_modules[\\/]maplibre-gl[\\/]/,
      use: [resolve(process.cwd(), 'tools/maplibre-worker-loader.cjs')],
    });
    return config;
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
