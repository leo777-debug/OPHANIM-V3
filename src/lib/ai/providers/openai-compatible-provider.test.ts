import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ssrf-guard', () => ({ validateHost: vi.fn().mockResolvedValue({ ok: true }) }));

import { openAiCompatibleProvider, validateAiBaseUrl } from './openai-compatible-provider';
import { validateHost } from '@/lib/ssrf-guard';
import { parseAiConfig } from '../config';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('openAiCompatibleProvider', () => {
  it('accepts keyless local configuration and omits authentication', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const config = parseAiConfig({ baseUrl: 'http://localhost:11434/v1', model: 'local-model', enabledTasks: ['summarize'] });
    expect(config).not.toBeNull();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Local summary' } }] })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await openAiCompatibleProvider.generate(config!, { task: 'summarize', input: 'Supplied incident' })).toBe('Local summary');
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://localhost:11434/v1/chat/completions');
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    expect(validateHost).not.toHaveBeenCalled();
  });

  it('requires an explicit local origin allowlist in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AI_LOCAL_BASE_URLS', '');
    vi.mocked(validateHost).mockResolvedValueOnce({ ok: false, reason: 'private' });
    await expect(validateAiBaseUrl('http://localhost:11434/v1')).rejects.toThrow('AI_LOCAL_BASE_URLS');
    vi.stubEnv('AI_LOCAL_BASE_URLS', 'http://localhost:11434');
    await expect(validateAiBaseUrl('http://localhost:11434/v1')).resolves.toBeUndefined();
  });
  it('uses chat completions without tools or search calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Concise summary.' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const output = await openAiCompatibleProvider.generate(
      { apiKey: 'key', baseUrl: 'https://api.example.com/v1', model: 'model', enabledTasks: ['summarize'] },
      { task: 'summarize', context: { item: 'source text' } },
    );
    expect(output).toBe('Concise summary.');
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).not.toHaveProperty('tools');
  });
});
