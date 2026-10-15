import { NextRequest } from 'next/server';
import { expect,it,vi } from 'vitest';
vi.mock('@/lib/auth/actor',()=>({requireAuthenticatedActor:vi.fn(async()=>({organizationId:'synthetic-org',userId:'synthetic-user',role:'owner'}))}));
vi.mock('@/lib/cyber/inventory',()=>({createCyberClient:vi.fn(),listCyberClients:vi.fn(async()=>{throw new Error('synthetic-private-key-marker /private/tenant-file.txt');})}));
import { GET } from './clients/route';
it('does not echo raw operational exceptions to an authenticated browser',async()=>{
  const response=await GET(new NextRequest('http://localhost/api/cyber/clients'));
  expect(await response.text()).not.toContain('synthetic-private-key-marker');
});
