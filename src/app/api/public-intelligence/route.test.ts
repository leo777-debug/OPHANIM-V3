import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ collect: vi.fn().mockResolvedValue({ events: [], diagnostics: [] }) }));
vi.mock('@/lib/intelligence/event-provider-registry', () => ({ collectIntelligenceEvents: mocks.collect }));
vi.mock('@/lib/ssrf-guard', () => ({ getClientIp: () => 'test', isRateLimited: () => false }));
import { GET } from './route';
afterEach(() => vi.clearAllMocks());
describe('public advisory API', () => {
  it('serves public sources without organization access or private provider selection', async () => {
    const response = await GET(new NextRequest('https://app.example/api/public-intelligence'));
    expect(response.status).toBe(200); const body = await response.json(); expect(body.sources.length).toBe(6);
    expect(mocks.collect.mock.calls[0][0].providerIds).not.toContain('reviewed-osint-events');
    expect(mocks.collect.mock.calls[0][0].providerIds).not.toContain('fcdo-travel-advisory');
  });
  it('validates country input as a slug and never accepts a fetch URL', async () => {
    expect((await GET(new NextRequest('https://app.example/api/public-intelligence?country=http://localhost'))).status).toBe(400);
    await GET(new NextRequest('https://app.example/api/public-intelligence?country=united-arab-emirates'));
    expect(mocks.collect.mock.calls[0][0].providerIds).toContain('fcdo-travel-advisory');
  });
});
