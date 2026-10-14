import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ revoke: vi.fn(), supabase: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ SESSION_COOKIE: 'ophanim_session', revokeSession: mocks.revoke, clearSessionCookie: (response: Response) => response }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.supabase }));
import { POST } from './route';
beforeEach(() => { vi.clearAllMocks(); mocks.supabase.mockResolvedValue(null); });
it.each<Record<string,string>>([{ Origin: 'https://other.example' }, { 'sec-fetch-site': 'cross-site' }])('does not revoke a session on a cross-site request %j', async (headers) => {
  const result = await POST(new NextRequest('http://localhost/api/auth/logout', { method: 'POST', headers: { ...headers, Cookie: 'ophanim_session=synthetic' } }));
  expect(result.status).toBe(403); expect(mocks.revoke).not.toHaveBeenCalled(); expect(mocks.supabase).not.toHaveBeenCalled();
});
it('preserves same-origin logout', async () => {
  const result = await POST(new NextRequest('http://localhost/api/auth/logout', { method: 'POST', headers: { Origin: 'http://localhost', Cookie: 'ophanim_session=synthetic' } }));
  expect(result.status).toBe(200); expect(mocks.revoke).toHaveBeenCalledWith('synthetic');
});
