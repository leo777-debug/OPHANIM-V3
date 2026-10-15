import type { NextConfig } from "next";
import { resolve } from 'node:path';
import { securityHeaders } from './src/lib/http/security-headers';

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
    // Load requested routes first instead of preloading every operational module.
    preloadEntriesOnStart: false,
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
        headers: securityHeaders(process.env.NODE_ENV === 'production'),
      },
    ];
  },
};

export default nextConfig;
