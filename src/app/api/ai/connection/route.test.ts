import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/ssrf-guard', () => ({ isRateLimited: () => false, getClientIp: () => '192.0.2.1', validateHost: async () => ({ ok: true }) }));
import { POST } from './route';
afterEach(() => vi.unstubAllGlobals());

it('tests with a small output budget and returns an actionable sanitized 429', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"message":"monthly quota exceeded: secret-key"}', { status: 429, headers: { 'Retry-After': '60' } }));
  vi.stubGlobal('fetch', fetch);
  const response = await POST(new NextRequest('https://example.test/api/ai/connection', { method: 'POST', body: JSON.stringify({ apiKey: 'secret-key', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-2603' }) }));
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
  expect(await response.text()).not.toContain('secret-key');
  expect(JSON.parse(fetch.mock.calls[0][1].body).max_tokens).toBe(64);
});
