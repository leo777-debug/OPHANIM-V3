import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseWithOptionalAi, summarizeWithOptionalAi } from './ai';
import { VERIFY_FIXTURES } from './fixtures';
import { verifyClaim } from './service';
const generate = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ai/providers/registry', () => ({ getAiProvider: () => ({ generate }) }));
afterEach(() => vi.clearAllMocks());
const config = { baseUrl: 'http://localhost:11434/v1', model: 'test-model', enabledTasks: ['explain', 'summarize'] };
describe('Optional AI never decides or selects providers', () => {
  it('ignores AI provider/verdict/type attempts while requiring claim review', async () => {
    generate.mockResolvedValueOnce(JSON.stringify({ ...VERIFY_FIXTURES[1].claim, type: 'sanctions', expectedObservation: 'sanctions', providerIds: ['malicious'], verdict: 'CONFIRMED' }));
    const parsed = await parseWithOptionalAi('Magnitude 5.6 earthquake hit Tokyo', config);
    expect(parsed.claim.type).toBe('earthquake'); expect(parsed.claim.expectedObservation).toBe('earthquake'); expect(parsed.claim).not.toHaveProperty('providerIds'); expect(parsed.claim).not.toHaveProperty('verdict');
    expect(parsed.parser).toContain('review required');
  });
  it('a summary cannot mutate rule-based verdict/evidence', async () => {
    const result = await verifyClaim(null, { fixture: 'red-sea' }); generate.mockResolvedValueOnce('A summary only.');
    const summarized = await summarizeWithOptionalAi(result, config);
    expect(summarized.verdict).toBe('NOT CONFIRMED YET'); expect(summarized.evidence).toEqual(result.evidence); expect(summarized.aiSummary?.label).toBe('INFERENCE');
  });
  it('falls back on failed/invalid AI without losing claim or evidence', async () => {
    generate.mockRejectedValueOnce(new Error('Offline'));
    const parsed = await parseWithOptionalAi('Dubai airport is closed', config); expect(parsed.parser).toBe('rules');
    const result = await verifyClaim(null, { fixture: 'earthquake' }); generate.mockRejectedValueOnce(new Error('Offline'));
    expect(await summarizeWithOptionalAi(result, config)).toEqual(result);
  });
});
