import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ssrf-guard', () => ({ validateHost: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock('@/lib/http/pinned-public-fetch', () => ({ pinnedPublicFetch: vi.fn() }));

import { fetchAiEndpoint, openAiCompatibleProvider, validateAiBaseUrl } from './openai-compatible-provider';
import { validateHost } from '@/lib/ssrf-guard';
import { parseAiConfig } from '../config';
import { pinnedPublicFetch } from '@/lib/http/pinned-public-fetch';

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
    vi.mocked(pinnedPublicFetch).mockImplementation(fetchMock);
    const output = await openAiCompatibleProvider.generate(
      { apiKey: 'key', baseUrl: 'https://api.example.com/v1', model: 'model', enabledTasks: ['summarize'] },
      { task: 'summarize', context: { item: 'source text' } },
    );
    expect(output).toBe('Concise summary.');
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).not.toHaveProperty('tools');
  });
});

describe('explicitly allowlisted local AI transport', () => {
  function allowLocal() {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AI_LOCAL_BASE_URLS', 'http://127.0.0.1:3155');
  }

  it('rejects an oversized declared body before reading it', async () => {
    allowLocal();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-length': '10000' } })));
    await expect(fetchAiEndpoint('http://127.0.0.1:3155/v1/models', { maxResponseBytes: 8 })).rejects.toThrow(/size/i);
    expect(cancel).toHaveBeenCalled();
  });

  it('caps actual streamed bytes even without an honest content length', async () => {
    allowLocal();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(5)); controller.enqueue(new Uint8Array(5)); },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-length': '1' } })));
    await expect(fetchAiEndpoint('http://127.0.0.1:3155/v1/models', { maxResponseBytes: 8 })).rejects.toThrow(/size/i);
    expect(cancel).toHaveBeenCalled();
  });

  it('does not send an already cancelled request', async () => {
    allowLocal();
    const controller = new AbortController();
    controller.abort();
    const send = vi.fn().mockResolvedValue(new Response('unused'));
    vi.stubGlobal('fetch', send);
    await expect(fetchAiEndpoint('http://127.0.0.1:3155/v1/models', { signal: controller.signal })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps cancellation active while consuming response metadata', async () => {
    allowLocal();
    const controller = new AbortController();
    let releaseHeaders!: () => void;
    const headersReady = new Promise<void>((resolve) => { releaseHeaders = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (_input, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(stream) { init.signal!.addEventListener('abort', () => stream.error(init.signal!.reason), { once: true }); },
      });
      releaseHeaders();
      return new Response(body);
    }));
    const request = fetchAiEndpoint('http://127.0.0.1:3155/v1/models', { signal: controller.signal });
    const rejected = expect(request).rejects.toThrow();
    await headersReady;
    controller.abort();
    await rejected;
  });

  it('preserves HEAD response headers without trying to read a body', async () => {
    allowLocal();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { headers: { 'content-length': '10000', 'x-test': 'metadata' } })));
    const response = await fetchAiEndpoint('http://127.0.0.1:3155/v1/models', { method: 'HEAD', maxResponseBytes: 8 });
    expect(response.headers.get('x-test')).toBe('metadata');
    expect(await response.text()).toBe('');
  });

  it('keeps the deadline active after headers arrive', async () => {
    allowLocal();
    vi.stubGlobal('fetch', vi.fn(async (_input, init: RequestInit) => new Response(new ReadableStream<Uint8Array>({
      start(stream) { init.signal!.addEventListener('abort', () => stream.error(init.signal!.reason), { once: true }); },
    }))));
    await expect(fetchAiEndpoint('http://127.0.0.1:3155/v1/models', { timeoutMs: 20 })).rejects.toThrow(/timeout|aborted/i);
  });

  it('accepts a body exactly at the limit, preserving status and safe metadata', async () => {
    allowLocal();
    const send = vi.fn().mockResolvedValue(new Response('12345678', { status: 201, headers: { 'x-test': 'bounded' } }));
    vi.stubGlobal('fetch', send);
    const response = await fetchAiEndpoint('http://127.0.0.1:3155/v1/models', { maxResponseBytes: 8 });
    expect(await response.text()).toBe('12345678');
    expect(response.status).toBe(201);
    expect(response.headers.get('x-test')).toBe('bounded');
    expect(send.mock.calls[0][1].redirect).toBe('error');
  });

  it('delegates remote requests to the pinned public transport with the same limits', async () => {
    allowLocal();
    const options = { method: 'GET' as const, timeoutMs: 2500, maxResponseBytes: 1024 };
    vi.mocked(pinnedPublicFetch).mockResolvedValue(new Response('{}'));
    const send = vi.fn();
    vi.stubGlobal('fetch', send);
    await fetchAiEndpoint('https://model.example.test/v1/models', options);
    expect(pinnedPublicFetch).toHaveBeenCalledWith(new URL('https://model.example.test/v1/models'), options);
    expect(send).not.toHaveBeenCalled();
  });
});
