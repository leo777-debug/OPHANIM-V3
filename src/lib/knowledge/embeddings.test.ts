import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/ai/providers/openai-compatible-provider', () => ({ fetchAiEndpoint: vi.fn() }));
import { fetchAiEndpoint } from '@/lib/ai/providers/openai-compatible-provider';
import { embedTexts } from './embeddings';
const settings = { baseUrl: 'https://example.com', model: 'synthetic-model', apiKey: 'synthetic-key' };
afterEach(() => vi.resetAllMocks());
describe('embedding transport and response boundary', () => {
  it('uses the pinned AI endpoint transport with a bounded deadline', async () => {
    const vector = Array.from({ length: 1024 }, () => 0);
    vi.mocked(fetchAiEndpoint).mockResolvedValue(Response.json({ data: [{ index: 0, embedding: vector }] }));
    expect(await embedTexts(['Synthetic only'], settings)).toEqual([vector]);
    expect(fetchAiEndpoint).toHaveBeenCalledWith('https://example.com/v1/embeddings', expect.objectContaining({ timeoutMs: 120000, method: 'POST' }));
  });
  it('rejects incomplete or malformed vectors', async () => {
    vi.mocked(fetchAiEndpoint).mockResolvedValue(Response.json({ data: [{ index: 0, embedding: [1] }] }));
    await expect(embedTexts(['Synthetic only'], settings)).rejects.toThrow('1024-dimensional');
  });
  it('fails clearly without an embedding configuration before any request', async () => {
    await expect(embedTexts(['Synthetic only'], { baseUrl: '', model: '' })).rejects.toThrow('Configure');
    expect(fetchAiEndpoint).not.toHaveBeenCalled();
  });
});
