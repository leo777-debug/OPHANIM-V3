import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), server: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/supabase/proxy', () => ({ refreshSupabaseSession: mocks.refresh }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.server }));
vi.mock('@/lib/watchlists/db', () => ({ db: () => ({ query: mocks.query }) }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.stubEnv('OPHANIM_REQUIRE_SIGN_IN', ''); vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('UMAMI_ENDPOINT', ''); });
afterEach(() => vi.unstubAllEnvs());

describe('shared workspace routes', () => {
  it('returns a usable owner from auth/me with no session and no caching', async () => {
    const { GET } = await import('@/app/api/auth/me/route');
    const response = await GET(new NextRequest('https://ophanim.example/api/auth/me'));
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ signInRequired: false, actor: { role: 'owner', authProvider: 'shared' } });
  });
  it('redirects login straight into the requested workspace, blocking external and looping destinations', async () => {
    const { proxy } = await import('@/proxy');
    const event = { waitUntil: vi.fn() } as never;
    for (const [path, expected] of [
      ['/login', '/operations'], ['/login?returnTo=%2Flogistics%2Fimports', '/logistics/imports'],
      ['/login?returnTo=https%3A%2F%2Fevil.example', '/operations'], ['/login?returnTo=%2Flogin', '/operations'],
      ['/login?returnTo=%2Fapi%2Fauth%2Flogout', '/operations'],
    ]) {
      const response = await proxy(new NextRequest(`https://ophanim.example${path}`), event);
      expect(new URL(response.headers.get('location')!).pathname).toBe(expected);
      expect(new URL(response.headers.get('location')!).origin).toBe('https://ophanim.example');
    }
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('does not contact Supabase for regular shared workspace requests', async () => {
    const { proxy } = await import('@/proxy');
    expect((await proxy(new NextRequest('https://ophanim.example/operations'), { waitUntil: vi.fn() } as never)).status).toBe(200);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('retains session refresh when sign-in is restored', async () => {
    vi.stubEnv('OPHANIM_REQUIRE_SIGN_IN', 'true'); mocks.refresh.mockResolvedValue(new Response('signed-in-mode'));
    const { proxy } = await import('@/proxy');
    expect(await (await proxy(new NextRequest('https://ophanim.example/login'), { waitUntil: vi.fn() } as never)).text()).toBe('signed-in-mode');
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it('treats logout as a no-op in shared mode rather than calling external auth', async () => {
    const { POST } = await import('@/app/api/auth/logout/route');
    const response = await POST(new NextRequest('https://ophanim.example/api/auth/logout', { method: 'POST' }));
    expect(await response.json()).toMatchObject({ ok: true, sharedWorkspace: true });
    expect(mocks.server).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
  });
});
