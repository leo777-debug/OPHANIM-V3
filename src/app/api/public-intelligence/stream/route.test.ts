import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { publicSourceUpdates } from '@/lib/intelligence/public-source-updates';
vi.mock('@/lib/ssrf-guard', () => ({ getClientIp: () => 'test-client', isRateLimited: () => false }));
vi.mock('@/lib/intelligence/public-source-updates', async () => {
  const { PublicUpdateHub } = await import('@/lib/intelligence/public-update-hub');
  return { publicSourceUpdates: new PublicUpdateHub(async () => ({ revision: 'public-only', checkedAt: '2026-10-20T12:00:00Z', updateMode: 'polling', intervalSeconds: 300, failedSources: 0 })) };
});
afterEach(() => vi.useRealTimers());
describe('public source SSE channel', () => {
  it('streams explicitly periodic public notifications and releases subscriptions on abort', async () => {
    const abort = new AbortController();
    const response = await GET(new NextRequest('http://localhost/api/public-intelligence/stream', { signal: abort.signal }));
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const reader = response.body!.getReader(); let payload = '';
    for (let index = 0; index < 3 && !payload.includes('event: public-update'); index++) {
      const chunk = await reader.read(); payload += new TextDecoder().decode(chunk.value);
    }
    expect(payload).toContain('public-update'); expect(payload).toContain('"updateMode":"polling"');
    expect(payload).not.toMatch(/organizationId|apiKey|Authorization/);
    abort.abort(); await reader.cancel(); expect(publicSourceUpdates.subscribers).toBe(0);
  });
  it('closes bounded-duration connections and clears heartbeat timers on disconnect', async () => {
    vi.useFakeTimers();
    const response = await GET(new NextRequest('http://localhost/api/public-intelligence/stream'));
    const reader = response.body!.getReader(); await reader.read();
    await vi.advanceTimersByTimeAsync(55001);
    expect(publicSourceUpdates.subscribers).toBe(0); expect(vi.getTimerCount()).toBe(0);
    await reader.cancel();
  });
});
