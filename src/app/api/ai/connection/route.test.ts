import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/ssrf-guard', () => ({ isRateLimited: () => false, getClientIp: () => '192.0.2.1', validateHost: async () => ({ ok: true }) }));
import { POST } from './route';
beforeEach(() => { vi.stubEnv('AI_BASE_URL', 'https://api.mistral.ai/v1'); vi.stubEnv('AI_MODEL', 'mistral-small-2603'); vi.stubEnv('AI_API_KEY', 'secret-key'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('tests with a small output budget and returns an actionable sanitized 429', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response('{"data":[{"id":"mistral-small-2603","capabilities":{"completion_chat":true}}]}'))
    .mockResolvedValueOnce(new Response('{"message":"monthly quota exceeded: secret-key"}', { status: 429, headers: { 'Retry-After': '60' } }));
  vi.stubGlobal('fetch', fetch);
  const response = await POST(new NextRequest('https://example.test/api/ai/connection', { method: 'POST', body: JSON.stringify({ apiKey: 'secret-key', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-2603' }) }));
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain('secret-key');
  expect(body).toMatchObject({ modelListSucceeded: true, stage: 'generation' });
  expect(body.error).toContain('server credentials');
  expect(String(fetch.mock.calls[0][0])).toBe('https://api.mistral.ai/v1/models');
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer secret-key');
  expect(JSON.parse(fetch.mock.calls[1][1].body).max_tokens).toBe(64);
});

it('stops before generation when Mistral rejects the supplied key at model access', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"message":"not authorized"}', { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  const response = await POST(new NextRequest('https://example.test/api/ai/connection', { method: 'POST', body: JSON.stringify({ apiKey: 'fixture-key', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-2603' }) }));
  expect((await response.json())).toMatchObject({ modelListSucceeded: false, stage: 'model_access' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
