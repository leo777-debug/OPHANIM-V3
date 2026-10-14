import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@/lib/ai/access', () => ({ authorizeAiRequest: async () => null }));
vi.mock('@/lib/ssrf-guard', () => ({ getClientIp: () => 'fixture', isRateLimited: () => false }));
vi.mock('@/lib/ai/config', () => ({ parseAiConfig: () => ({ enabledTasks: ['summarize'] }), getServerAiConfig: () => null }));
vi.mock('@/lib/ai/local-model', () => ({ generateWithRouting: mocks.generate }));
import { POST } from './route';
beforeEach(() => vi.clearAllMocks());
it('does not echo credential-bearing provider failures to the browser', async () => {
  mocks.generate.mockRejectedValue(new Error('provider echoed synthetic-private-key in invalid JSON'));
  const response = await POST(new NextRequest('http://localhost/api/ai/generate', { method: 'POST', body: JSON.stringify({ task: 'summarize', input: 'Synthetic incident' }) }));
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('synthetic-private-key');
});
