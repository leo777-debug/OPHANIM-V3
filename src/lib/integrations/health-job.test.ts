import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ test: vi.fn(), read: vi.fn(), write: vi.fn(), send: vi.fn() }));
vi.mock('./status', () => ({ testIntegration: mocks.test, persistedIntegrationStatuses: async () => ({ integrations: [] }) }));
vi.mock('@/lib/runtime/store', () => ({ readRuntimeScope: mocks.read, writeRuntimeValue: mocks.write }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
import { runIntegrationHealthJob } from './health-job';
beforeEach(() => { vi.resetAllMocks(); mocks.test.mockImplementation(async (id: string) => ({ id, status: id === 'usgs' ? 'Error' : 'Not configured', observation: id === 'usgs' ? { scope: 'connection', error: 'down' } : null })); mocks.read.mockResolvedValue({ items: {}, storage: 'memory' }); mocks.write.mockResolvedValue({ storage: 'memory' }); });
describe('scheduled critical feed health', () => {
  it('does not send a first-failure alert or treat missing configuration as healthy', async () => {
    const result = await runIntegrationHealthJob(Date.parse('2026-10-19T12:00:00Z'));
    expect(result.email).toBe('not-needed'); expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.write).toHaveBeenCalledWith('integration-failures', 'usgs', { since: '2026-10-19T12:00:00.000Z', alertedAt: null });
    expect(mocks.write).not.toHaveBeenCalledWith('integration-failures', 'nasa', expect.anything());
  });
  it('reports unsent alerts honestly and suppresses repeat notifications within an episode', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    mocks.read.mockResolvedValue({ items: { usgs: { since: '2026-10-19T10:00:00Z', alertedAt: null } } });
    expect((await runIntegrationHealthJob(Date.parse('2026-10-19T12:00:00Z'))).email).toBe('not-configured');
    mocks.read.mockResolvedValue({ items: { usgs: { since: '2026-10-19T10:00:00Z', alertedAt: '2026-10-19T11:00:00Z' } } });
    expect((await runIntegrationHealthJob(Date.parse('2026-10-19T12:00:00Z'))).criticalFailures).toEqual([]);
    vi.unstubAllEnvs();
  });
});
