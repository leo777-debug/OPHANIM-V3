import type { NextRequest } from 'next/server';

/** APP_URL is the configured public origin; Next may normalize the internal request host. */
export function sameOrigin(request: NextRequest): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const source = new URL(origin), configured = process.env.APP_URL?.trim();
    const expected = new URL(configured || request.url);
    if (!configured && request.headers.get('host')) {
      const publicHost = new URL(`${expected.protocol}//${request.headers.get('host')}`);
      if (publicHost.username || publicHost.password || publicHost.pathname !== '/' || publicHost.search || publicHost.hash) return false;
      expected.host = publicHost.host;
    }
    return ['http:', 'https:'].includes(source.protocol) && !source.username && !source.password
      && source.origin === expected.origin;
  } catch { return false; }
}
