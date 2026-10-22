import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
function worker(offline = false) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const cache = { addAll: vi.fn<(files: string[]) => Promise<void>>(async () => {}), match: vi.fn(async () => new Response('OFFLINE / SAVED VIEW')), put: vi.fn() };
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ['unrelated-cache', 'ophanim-public-snapshot-v1', 'ophanim-offline-shell-old']), delete: vi.fn(async () => true) };
  const fetch = vi.fn(async () => { if (offline) throw new Error('Offline'); return new Response('Network only'); });
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { URL, Response, caches, fetch, self: { location: { origin: 'https://ophanim.example' }, clients: { claim: vi.fn() }, addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; } } });
  return { handlers, cache, caches, fetch };
}
describe('offline worker cache isolation', () => {
  it('does not intercept private APIs, mutation requests or cross-origin resources', () => {
    const { handlers, caches } = worker(), respondWith = vi.fn();
    for (const request of [
      { url: 'https://ophanim.example/api/platform/entities', method: 'GET', mode: 'cors' },
      { url: 'https://ophanim.example/api/scenario-exposure', method: 'POST', mode: 'cors' },
      { url: 'https://thirdparty.example/data', method: 'GET', mode: 'cors' },
    ]) handlers.fetch({ request, respondWith });
    expect(respondWith).not.toHaveBeenCalled(); expect(caches.open).not.toHaveBeenCalled();
  });
  it('falls back to the public offline shell without caching a protected navigation response', async () => {
    for (const offline of [true, false]) {
      const { handlers, cache } = worker(offline); let response: Promise<Response> | undefined;
      handlers.fetch({ request: { url: 'https://ophanim.example/logistics/shipments/private-id', method: 'GET', mode: 'navigate' }, respondWith: (value: Promise<Response>) => { response = value; } });
      expect(await (await response!).text()).toBe(offline ? 'OFFLINE / SAVED VIEW' : 'Network only');
      expect(cache.put).not.toHaveBeenCalled();
    }
  });
  it('preloads only explicit public shell files and cleans only its own obsolete shell caches', async () => {
    const { handlers, cache, caches } = worker(); let pending: Promise<unknown> | undefined;
    const event = { waitUntil: (promise: Promise<unknown>) => { pending = promise; } };
    handlers.install(event); await pending;
    expect(cache.addAll.mock.calls[0][0]).toEqual(['/offline.html', '/offline-snapshot.js', '/favicon.svg', '/site.webmanifest', '/android-chrome-192x192.png', '/android-chrome-512x512.png']);
    handlers.activate(event); await pending;
    expect(caches.delete).toHaveBeenCalledExactlyOnceWith('ophanim-offline-shell-old');
  });
});
