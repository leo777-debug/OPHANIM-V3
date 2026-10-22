import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizationActor } from '@/lib/operations/types';

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), transactionQuery: vi.fn(), release: vi.fn(), scan: vi.fn(), status: vi.fn() }));
vi.mock('@/lib/watchlists/db', () => ({ db: () => ({ query: mocks.query, connect: mocks.connect }) }));
vi.mock('./client', () => ({ shodanClient: () => ({ submitAuthorizedScan: mocks.scan, scanStatus: mocks.status }) }));
import { getScanStatus, submitScan } from './scans';

const actor: OrganizationActor = { organizationId: 'org-one', userId: 'user-one', role: 'owner' };
const input = { ips: '203.0.113.1', confirm: true, requestId: '00000000-0000-4000-8000-000000000001' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AUTHORIZED_SCAN_TARGETS', JSON.stringify({ 'org-one': ['203.0.113.0/24'] }));
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.transactionQuery.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('insert') ? [{ id: 'audit-one' }] : [] }));
  mocks.connect.mockResolvedValue({ query: mocks.transactionQuery, release: mocks.release });
  mocks.scan.mockResolvedValue({ id: 'scan-one', count: 1, credits_left: 10, status: 'SUBMITTING', warnings: [] });
  mocks.status.mockResolvedValue({ id: 'scan-one', status: 'DONE' });
});
afterEach(() => vi.unstubAllEnvs());

describe('Audited organization-scoped Shodan scans', () => {
  it('requires owner permission before DB access or HTTP', async () => {
    await expect(submitScan({ ...actor, role: 'analyst' }, input)).rejects.toThrow('authorized');
    expect(mocks.connect).not.toHaveBeenCalled(); expect(mocks.scan).not.toHaveBeenCalled();
  });
  it('rejects unauthorized targets and missing confirmation before DB/HTTP', async () => {
    await expect(submitScan(actor, { ...input, ips: '198.51.100.1' })).rejects.toMatchObject({ code: 'unauthorized_target' });
    await expect(submitScan(actor, { ...input, confirm: false })).rejects.toMatchObject({ code: 'confirmation_required' });
    expect(mocks.connect).not.toHaveBeenCalled(); expect(mocks.scan).not.toHaveBeenCalled();
  });
  it('reserves actor/time/targets before submission and records the upstream ID', async () => {
    expect(await submitScan(actor, input)).toMatchObject({ id: 'scan-one' });
    const audit = mocks.transactionQuery.mock.calls.find(([sql]) => sql.startsWith('insert'))!;
    expect(audit[1].slice(0, 2)).toEqual(['org-one', 'user-one']);
    expect(JSON.parse(audit[1][2])).toMatchObject({ targets: ['203.0.113.1'], requestId: input.requestId, submittedAt: expect.any(String) });
    expect(mocks.transactionQuery.mock.invocationCallOrder[3]).toBeLessThan(mocks.scan.mock.invocationCallOrder[0]);
    expect(mocks.query.mock.calls[0][1].slice(0, 2)).toEqual(['audit-one', 'org-one']);
    expect(mocks.query.mock.calls[0][1][2]).toContain('scan-one');
    expect(mocks.release).toHaveBeenCalled();
  });
  it('never submits when durable audit storage fails', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('offline database'));
    await expect(submitScan(actor, input)).rejects.toThrow('offline database');
    expect(mocks.scan).not.toHaveBeenCalled();
  });
  it('returns a recorded result for a replay without another upstream call', async () => {
    mocks.transactionQuery.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('select metadata') ? [{ metadata: { result: { id: 'already-submitted' } } }] : [] }));
    expect(await submitScan(actor, input)).toEqual({ id: 'already-submitted' });
    expect(mocks.scan).not.toHaveBeenCalled();
  });
  it('keeps an ambiguous submission reserved instead of scanning twice', async () => {
    mocks.transactionQuery.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('select metadata') ? [{ metadata: { targets: [input.ips] } }] : [] }));
    await expect(submitScan(actor, input)).rejects.toMatchObject({ code: 'scan_pending' });
    expect(mocks.scan).not.toHaveBeenCalled();
  });
  it('records submission failure without raw errors or secrets', async () => {
    mocks.scan.mockRejectedValueOnce(new Error('secret URL should not be persisted'));
    await expect(submitScan(actor, input)).rejects.toBeDefined();
    const failure = mocks.query.mock.calls[0];
    expect(failure[0]).toContain('unconfirmed');
    expect(failure[1][2]).toBe('{"errorCode":"provider_down"}');
  });
  it('denies polling another organization\'s scan before HTTP', async () => {
    await expect(getScanStatus(actor, 'someone-elses-scan')).rejects.toMatchObject({ status: 404 });
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls[0][1]).toEqual(['org-one', 'someone-elses-scan']);
    expect(mocks.query.mock.calls[0][0]).toContain('organization_id=$1');
  });
  it('polls only a scan recorded in the requesting organization', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 'audit-one' }] });
    expect(await getScanStatus(actor, 'scan-one')).toMatchObject({ status: 'DONE' });
    expect(mocks.status).toHaveBeenCalledWith('scan-one');
  });
});
