import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock('@/lib/integrations/probes', () => ({ requestIntegration: mocks.transport }));
import { researchInSandbox, validateSandboxResearchRequest } from './sandbox-research';
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('AI_SANDBOX_RESEARCH_URL', 'https://research.example.test/private'); vi.stubEnv('AI_SANDBOX_RESEARCH_TOKEN', 'fixture-only-token'); });
afterEach(() => { vi.unstubAllEnvs(); });
describe('sandbox research adapter', () => {
  it('accepts only declared, bounded research purposes', () => {
    expect(validateSandboxResearchRequest({ subject: 'Port disruption reports', purpose: 'confirm' })).toEqual({ subject: 'Port disruption reports', purpose: 'confirm' });
    expect(() => validateSandboxResearchRequest({ subject: 'x', purpose: 'confirm' })).toThrow('at least two');
    expect(() => validateSandboxResearchRequest({ subject: 'Port disruption reports', purpose: 'browse_everything' })).toThrow('Unsupported');
  });
  it('tests authenticated worker health before sending bounded context through pinned transport', async () => {
    mocks.transport.mockResolvedValueOnce('{}').mockResolvedValueOnce(JSON.stringify({ summary: 'Source-backed port notice assessment.', riskIndicator: 'moderate', uncertainty: 'Incomplete.', sources: [{ title: 'Primary notice', url: 'https://source.example.test/notice' }] }));
    const result = await researchInSandbox({ subject: 'Port closure', purpose: 'confirm' });
    expect(result.riskIndicator).toBe('moderate'); expect(result.sources[0]?.url).toBe('https://source.example.test/notice');
    expect(result.collectedAt).toBeNull(); expect(Number.isFinite(Date.parse(result.retrievedAt))).toBe(true);
    expect(mocks.transport.mock.calls[0][0]).toMatchObject({ url: 'https://research.example.test/private/health', headers: { Authorization: 'Bearer fixture-only-token' } });
    const [request, , timeout] = mocks.transport.mock.calls[1];
    expect(request.url).toBe('https://research.example.test/private/v1/research'); expect(timeout).toBe(45000);
    expect(JSON.parse(request.body)).toMatchObject({ subject: 'Port closure', policy: { browserExecution: 'sandbox_only', allowOperationalActions: false, requireSourceAttribution: true } });
  });
  it('withholds research context when the worker health check fails', async () => {
    mocks.transport.mockRejectedValue(new Error('Service not running.'));
    await expect(researchInSandbox({ subject: 'Port closure', purpose: 'confirm' })).rejects.toThrow('Service not running'); expect(mocks.transport).toHaveBeenCalledTimes(1);
    vi.stubEnv('AI_SANDBOX_RESEARCH_TOKEN', ''); await expect(researchInSandbox({ subject: 'Port closure', purpose: 'confirm' })).rejects.toThrow('not configured'); expect(mocks.transport).toHaveBeenCalledTimes(1);
  });
  it('leaves invalid and future publication timestamps unknown', async () => {
    mocks.transport.mockResolvedValueOnce('{}').mockResolvedValueOnce(JSON.stringify({
      summary: 'Fixture', sources: ['invalid', '2999-01-01'].map(publishedAt => ({ title: 'Fixture source', url: 'https://source.example/notice', publishedAt })),
    }));
    const result = await researchInSandbox({ subject: 'Public notice', purpose: 'confirm' });
    expect(result.sources).toHaveLength(2);
    expect(result.sources.every(source => source.publishedAt === undefined)).toBe(true);
  });
});
