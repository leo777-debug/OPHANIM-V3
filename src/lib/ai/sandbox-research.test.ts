import { describe, expect, it, vi } from 'vitest';
import { researchInSandbox, validateSandboxResearchRequest } from './sandbox-research';

describe('sandbox research adapter', () => {
  it('accepts only declared, bounded research purposes', () => {
    expect(validateSandboxResearchRequest({ subject: 'Port disruption reports', purpose: 'confirm' })).toEqual({ subject: 'Port disruption reports', purpose: 'confirm' });
    expect(() => validateSandboxResearchRequest({ subject: 'x', purpose: 'confirm' })).toThrow('at least two');
    expect(() => validateSandboxResearchRequest({ subject: 'Port disruption reports', purpose: 'browse_everything' })).toThrow('Unsupported');
  });

  it('sends only the bounded research contract to the configured sandbox', async () => {
    process.env.AI_SANDBOX_RESEARCH_URL = 'https://research.example.test/private';
    process.env.AI_SANDBOX_RESEARCH_TOKEN = 'sandbox-token';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      summary: 'Two independent reports describe the same port closure.',
      riskIndicator: 'moderate',
      uncertainty: 'Reporting remains incomplete.',
      sources: [{ title: 'Primary notice', url: 'https://source.example.test/notice' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await researchInSandbox({ subject: 'Port closure', purpose: 'confirm' });

    expect(result.riskIndicator).toBe('moderate');
    expect(result.sources[0]?.url).toBe('https://source.example.test/notice');
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://research.example.test/private/v1/research');
    expect(JSON.parse(String(init.body))).toMatchObject({
      subject: 'Port closure',
      policy: { browserExecution: 'sandbox_only', allowOperationalActions: false, requireSourceAttribution: true },
    });
  });
});
