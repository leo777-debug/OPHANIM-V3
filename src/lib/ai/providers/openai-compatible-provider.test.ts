import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ssrf-guard', () => ({ validateHost: vi.fn().mockResolvedValue({ ok: true }) }));

import { openAiCompatibleProvider } from './openai-compatible-provider';

describe('openAiCompatibleProvider', () => {
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
