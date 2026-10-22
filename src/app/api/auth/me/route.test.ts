import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({actor:vi.fn()}));
vi.mock('@/lib/auth/actor',()=>({getAuthenticatedActor:mocks.actor}));
import { GET } from './route';
describe('private session status',()=>{
  beforeEach(()=>vi.clearAllMocks());
  it('keeps unsigned visitors rejected with an actionable uncacheable prompt',async()=>{
    mocks.actor.mockResolvedValue(null);
    const response=await GET(new NextRequest('http://localhost/api/auth/me'));
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect((await response.json()).error).toContain('Sign in');
  });
  it('does not cache actor information or leak database exceptions',async()=>{
    mocks.actor.mockResolvedValue({userId:'fixture-user',organizationId:'fixture-org'});
    const response=await GET(new NextRequest('http://localhost/api/auth/me'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    mocks.actor.mockRejectedValue(new Error('DATABASE_CREDENTIAL_MUST_NOT_LEAK'));
    const failed=await GET(new NextRequest('http://localhost/api/auth/me'));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('DATABASE_CREDENTIAL');
  });
});
