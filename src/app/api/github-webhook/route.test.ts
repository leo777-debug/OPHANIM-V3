import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/http/pinned-public-fetch', () => ({ pinnedPublicFetch: vi.fn() }));
import { pinnedPublicFetch } from '@/lib/http/pinned-public-fetch';
import { POST } from './route';

describe('GitHub forwarding webhook security', () => {
  beforeEach(() => {
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', 'synthetic-test-secret');
    vi.stubEnv('GITHUB_WEBHOOK_FORWARD_URL', 'https://example.com/hook');
    vi.mocked(pinnedPublicFetch).mockResolvedValue(new Response('{}'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });
  const request = (body = '{}', signature?: string) => new Request('https://ophanim.example/api/github-webhook', {
    method: 'POST', body, headers: signature ? { 'x-hub-signature-256': signature } : {},
  });
  const sign = (body: string) => 'sha256=' + createHmac('sha256', 'synthetic-test-secret').update(body).digest('hex');
  it('fails closed without configuration', async () => {
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', '');
    expect((await POST(request())).status).toBe(503);
    expect(pinnedPublicFetch).not.toHaveBeenCalled();
  });
  it.each([undefined, 'bad-format', 'sha256=' + '0'.repeat(64)])('rejects absent or invalid signature %s', async (signature) => {
    expect((await POST(request('{}', signature))).status).toBe(401);
    expect(pinnedPublicFetch).not.toHaveBeenCalled();
  });
  it('rejects a changed payload and caps actual bytes before forwarding', async () => {
    expect((await POST(request('{"changed":true}', sign('{}')))).status).toBe(401);
    const huge = 'x'.repeat(1024 * 1024 + 1);
    expect((await POST(request(huge, sign(huge)))).status).toBe(413);
    expect(pinnedPublicFetch).not.toHaveBeenCalled();
  });
  it('uses HTTPS-only pinned transport with a bounded deadline', async () => {
    expect((await POST(request('{}', sign('{}')))).status).toBe(200);
    expect(pinnedPublicFetch).toHaveBeenCalledWith('https://example.com/hook', expect.objectContaining({ httpsOnly: true, timeoutMs: 10000, maxResponseBytes: 65536, body: '{}' }));
  });
  it('does not expose or log credential-bearing transport failures', async () => {
    vi.mocked(pinnedPublicFetch).mockRejectedValue(new Error('synthetic-private-token-marker'));
    const response = await POST(request('{}', sign('{}')));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('synthetic-private-token-marker');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('synthetic-private-token-marker');
  });
});
