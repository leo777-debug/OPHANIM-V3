import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/auth/actor', () => ({ getAuthenticatedActor: vi.fn() }));
import { POST } from './route';
import { sdkState } from '@/lib/sdk/ingestion';
const request = (body: unknown, key = 'fixture-only') => new NextRequest('https://app.example/api/sdk/ingest', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
beforeEach(() => { vi.stubEnv('SDK_INGEST_KEY', 'fixture-only'); vi.stubEnv('SDK_ORGANIZATION_ID', '11111111-1111-4111-8111-111111111111'); });
afterEach(() => { vi.unstubAllEnvs(); sdkState(); });
describe('SDK machine endpoint', () => {
  it('checks credentials without a browser session and disables missing configuration', async () => {
    expect((await POST(request({}, 'wrong'))).status).toBe(401);
    vi.stubEnv('SDK_INGEST_KEY', ''); expect((await POST(request({})) ).status).toBe(503);
  });
  it('bounds streamed bodies even without Content-Length', async () => {
    const response = await POST(new NextRequest('https://app.example/api/sdk/ingest', { method: 'POST', body: 'x'.repeat(1000001) }));
    expect(response.status).toBe(413); expect(response.headers.get('cache-control')).toContain('private');
    expect((await POST(request(null))).status).toBe(400);
  });
  it('accepts legacy body credentials and an explicit diagnostic without storing map entities', async () => {
    const response = await POST(new NextRequest('https://app.example/api/sdk/ingest', { method: 'POST', body: JSON.stringify({ apiKey: 'fixture-only', source: 'fixture', diagnostic: true, entities: [{ id: 'test', position: { lat: 0, lng: 0 } }] }) }));
    expect(await response.json()).toMatchObject({ accepted: 1, diagnostic: true }); expect(sdkState().entities.size).toBe(0);
    expect((await POST(request({ source: 'test', entities: Array(501).fill({}) }))).status).toBe(400);
  });
});
