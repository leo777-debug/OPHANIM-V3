import { NextRequest } from 'next/server';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routes = ['earthquakes', 'weather', 'fires', 'flights', 'maritime', 'markets', 'crypto', 'space-weather', 'radar', 'air-quality', 'satellites', 'gdelt', 'malware', 'cyber-threats', 'frontlines', 'conflicts', 'news', 'fusion', 'stats', 'geo', 'region-dossier', 'sentinel', 'scm-suppliers', 'osint/dns', 'osint/ip', 'osint/certs', 'osint/cve', 'osint/bgp', 'osint/github', 'osint/threats', 'osint/whois', 'cctv', 'osint/mac', 'osint/leaks', 'entity/expand'];
const modes = ['http-error', 'garbage', 'empty', 'timeout'] as const;
beforeEach(() => {
  vi.resetModules();
  for (const key of ['AIS_API_KEY', 'CUSTOMER_AIS_API_URL', 'MARINETRAFFIC_AIS_API_URL', 'OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET', 'GEMINI_API_KEY', 'OPENAI_API_KEY']) vi.stubEnv(key, '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Fixture timeout', 'TimeoutError')), 5);
    return controller.signal;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe.each(routes)('legacy /api/%s failure contract', (route) => {
  it.each(modes)('%s settles without throwing or exposing upstream secrets', async (mode) => {
    const upstream = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (mode === 'timeout') return new Promise<Response>((_resolve, reject) => {
        if (!init?.signal) { reject(new Error('Provider request has no deadline')); return; }
        if (init.signal.aborted) reject(init.signal.reason);
        else init.signal.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
      return new Response(mode === 'garbage' ? 'not-json' : JSON.stringify(mode === 'empty' ? [] : { secret: 'upstream-private-fixture' }), { status: mode === 'http-error' ? 503 : 200 });
    });
    vi.stubGlobal('fetch', upstream);
    const handlers = await import(resolve('src/app/api', route, 'route.ts').replaceAll('\\', '/')) as { GET: (request: NextRequest) => Promise<Response> };
    const response = await handlers.GET(new NextRequest(`http://localhost/api/${route}?domain=example.test&ip=192.0.2.10&q=fixture&query=192.0.2.10&user=synthetic-fixture&cve=CVE-2026-0001&mac=02:00:00:00:00:01&email=synthetic@example.test&type=ip&id=192.0.2.10`));
    expect(response).toBeInstanceOf(Response);
    expect([200, 400, 500, 502, 503]).toContain(response.status);
    const text = await response.text();
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).not.toContain('upstream-private-fixture');
    expect(upstream).toHaveBeenCalled();
    if (mode === 'timeout') {
      for (const [, init] of upstream.mock.calls) expect(init?.signal, 'Upstream requests need a deadline').toBeInstanceOf(AbortSignal);
    }
    if (route === 'space-weather') {
      expect(JSON.parse(text)).toMatchObject({ kp_index: null, storm_level: 'Unknown' });
    }
  });
});
