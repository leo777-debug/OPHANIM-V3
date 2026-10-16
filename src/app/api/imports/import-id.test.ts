import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('server-only', () => ({}));
const fixture = vi.hoisted(() => ({
  id: '11111111-1111-4111-8111-111111111111',
  actor: { userId: 'fixture-owner', organizationId: 'fixture-org', role: 'owner' },
}));
vi.mock('@/lib/auth/actor', () => ({ requireAuthenticatedActor: vi.fn(async () => fixture.actor) }));
vi.mock('@/lib/imports/access', () => ({ assertImportFeature: vi.fn() }));
vi.mock('@/lib/imports/repository', () => ({
  getImport: vi.fn(async () => ({ id: fixture.id, importType: 'shipment' })),
  getImportRows: vi.fn(async () => []),
}));
vi.mock('@/lib/imports/jobs', () => ({ confirmImport: vi.fn(async () => ({ queued: true })) }));
vi.mock('@/lib/imports/error-report', () => ({ buildImportErrorReport: vi.fn(() => 'row,error\n') }));
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { getImport } from '@/lib/imports/repository';
import { confirmImport } from '@/lib/imports/jobs';
import { GET as details } from './[id]/route';
import { POST as confirm } from './[id]/confirm/route';
import { GET as report } from './[id]/error-report/route';

describe('canonical import IDs reach authorized workflow handlers', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([['details', 'GET', details], ['confirm', 'POST', confirm], ['error report', 'GET', report]] as const)(
    '%s accepts a standard UUID and retains the actor scope', async (name, method, handler) => {
      const response = await handler(new NextRequest(`http://localhost/api/imports/${fixture.id}`, { method }), { params: Promise.resolve({ id: fixture.id }) });
      expect(response.status).toBe(200);
      expect(requireAuthenticatedActor).toHaveBeenCalledOnce();
      if (name === 'confirm') expect(confirmImport).toHaveBeenCalledWith(fixture.actor, fixture.id);
      else expect(getImport).toHaveBeenCalledWith(fixture.actor, fixture.id);
    },
  );
  it.each([['details', 'GET', details], ['confirm', 'POST', confirm], ['error report', 'GET', report]] as const)(
    '%s still rejects malformed IDs without a repository query', async (_name, method, handler) => {
      const response = await handler(new NextRequest('http://localhost/api/imports/invalid', { method }), { params: Promise.resolve({ id: 'not-a-uuid' }) });
      expect(response.status).toBe(400);
      expect(getImport).not.toHaveBeenCalled();
      expect(confirmImport).not.toHaveBeenCalled();
    },
  );
});
