import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/lib/auth/actor', () => ({ getAuthenticatedActor: mocks.actor }));
import { GET } from './route';
import { GET as status } from '../ingest/route';
const org = '11111111-1111-4111-8111-111111111111';
beforeEach(() => { vi.stubEnv('SDK_INGEST_KEY', 'test-fixture-only'); vi.stubEnv('SDK_ORGANIZATION_ID', org); mocks.actor.mockResolvedValue({ organizationId: org }); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('SDK read isolation and stream lifecycle', () => {
  it('rejects signed-out browsers before creating a stream or returning metadata', async () => {
    mocks.actor.mockResolvedValue(null);
    const denied = await GET(new NextRequest('https://app.example/api/sdk/stream'));
    expect(denied.status).toBe(401); expect(denied.headers.get('cache-control')).toBe('private, no-store');
    expect((await status(new NextRequest('https://app.example/api/sdk/ingest'))).status).toBe(401);
  });
  it('rejects another organization and incomplete configuration', async () => {
    mocks.actor.mockResolvedValue({ organizationId: 'another-org' });
    expect((await GET(new NextRequest('https://app.example/api/sdk/stream'))).status).toBe(403);
    mocks.actor.mockResolvedValue({ organizationId: org }); vi.stubEnv('SDK_ORGANIZATION_ID', '');
    expect((await GET(new NextRequest('https://app.example/api/sdk/stream'))).status).toBe(503);
  });
  it('does not invent source counts/update times and cleans timers on cancellation', async () => {
    vi.useFakeTimers();
    const response = await GET(new NextRequest('https://app.example/api/sdk/stream'));
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('"feedCount":null'); expect(first).toContain('"lastUpdate":null');
    expect(response.headers.get('cache-control')).toContain('private');
    await reader.cancel(); expect(vi.getTimerCount()).toBe(0);
  });
  it('closes an old tenant stream when deployment organization configuration changes', async () => {
    vi.useFakeTimers();
    const response = await GET(new NextRequest('https://app.example/api/sdk/stream')), reader = response.body!.getReader();
    await reader.read(); vi.stubEnv('SDK_ORGANIZATION_ID', '22222222-2222-4222-8222-222222222222');
    await vi.advanceTimersByTimeAsync(5000); expect((await reader.read()).done).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
});
