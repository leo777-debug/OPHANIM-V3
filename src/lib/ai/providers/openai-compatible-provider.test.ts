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
    expect(JSON.parse(init.body).max_tokens).toBe(1024);
  });

  it('caps output tokens for small connection tests and clamps excessive budgets', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'Connected' } }] }))));
    vi.stubGlobal('fetch', fetchMock);
    const config = { apiKey: 'key', baseUrl: 'https://api.example.com/v1', model: 'model', enabledTasks: [] };
    for (const [requested, expected] of [[64, 64], [99999, 2048], [-1, 32], [NaN, 1024]]) {
      await openAiCompatibleProvider.generate(config, { task: 'explain', maxOutputTokens: requested });
      expect(JSON.parse(fetchMock.mock.lastCall![1].body).max_tokens).toBe(expected);
    }
  });

  it('does not blindly retry a provider rate limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"message":"Too many requests"}', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(openAiCompatibleProvider.generate({ apiKey: 'key', baseUrl: 'https://api.example.com/v1', model: 'model', enabledTasks: [] }, { task: 'explain' })).rejects.toThrow('429');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
