import { afterEach, expect, it, vi } from 'vitest';
import { stealthFetch } from './stealthFetch';
afterEach(() => vi.unstubAllGlobals());
it('preserves an already-aborted caller signal', async () => {
  const signal = AbortSignal.abort();
  const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
    init.signal?.throwIfAborted();
    return new Response('should not succeed');
  });
  vi.stubGlobal('fetch', fetch);
  await expect(stealthFetch('https://fixtures.example.test', { signal })).rejects.toMatchObject({ name: 'AbortError' });
});
it('keeps cancellation attached while the response body is being read', async () => {
  const controller = new AbortController();
  let used: AbortSignal | null | undefined;
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
    used = init.signal;
    return new Response('fixture');
  }));
  await stealthFetch('https://fixtures.example.test', { signal: controller.signal });
  controller.abort();
  expect(used?.aborted).toBe(true);
});
