import { createHash } from 'node:crypto';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ bytes: 'synthetic-model-for-test-only' }));
vi.mock('node:fs', () => ({ createReadStream: vi.fn(() => (async function* () { yield Buffer.from(fixture.bytes); })()) }));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn(), realpath: vi.fn(), stat: vi.fn() }));
vi.mock('./providers/registry', () => ({ getAiProvider: vi.fn() }));
vi.mock('./providers/openai-compatible-provider', () => ({ validateAiBaseUrl: vi.fn(), fetchAiEndpoint: vi.fn() }));

import { readFile, realpath, stat } from 'node:fs/promises';
import { fetchAiEndpoint } from './providers/openai-compatible-provider';
import { localModelStatus } from './local-model';

const root = path.resolve('synthetic-model-root');
const model = 'synthetic-logistics:test';
const filename = 'test.gguf';
const hash = createHash('sha256').update(fixture.bytes).digest('hex');
const manifest = (sha256 = hash) => JSON.stringify({ files: [{ path: filename, sha256, version: 'test-only' }] });
const metadata = () => new Response(JSON.stringify({ data: [{ id: model }] }));

beforeEach(() => {
  vi.stubEnv('OPHANIM_MODELS_DIR', root);
  vi.stubEnv('OPHANIM_MODEL_FILE', filename);
  vi.stubEnv('OPHANIM_LOCAL_MODEL', model);
  vi.stubEnv('OPHANIM_LOCAL_BASE_URL', 'https://model.example.test/v1');
  vi.mocked(stat).mockResolvedValue({ mtimeMs: 1, size: fixture.bytes.length } as Awaited<ReturnType<typeof stat>>);
  vi.mocked(readFile).mockResolvedValue(manifest());
  vi.mocked(realpath).mockImplementation(async (input) => String(input));
  vi.mocked(fetchAiEndpoint).mockImplementation(async () => metadata());
  vi.stubGlobal('fetch', vi.fn(async () => metadata()));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe('verified local-model status', () => {
  it('probes metadata only through the pinned, bounded transport', async () => {
    const status = await localModelStatus();
    expect(status).toMatchObject({ available: true, model, version: 'test-only' });
    expect(fetchAiEndpoint).toHaveBeenCalledWith('https://model.example.test/v1/models', {
      method: 'GET', timeoutMs: 2500, maxResponseBytes: 1024 * 1024,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not return raw transport errors that can contain credentials', async () => {
    const error = new Error('synthetic-secret-marker Authorization=Bearer test-only');
    vi.mocked(fetchAiEndpoint).mockRejectedValue(error);
    vi.mocked(fetch).mockRejectedValue(error);
    const status = await localModelStatus();
    expect(status.available).toBe(false);
    expect(status.message).not.toContain('synthetic-secret-marker');
    expect(status.message).toContain('AI SETUP');
  });

  it('does not expose malformed provider JSON in the status message', async () => {
    vi.mocked(fetchAiEndpoint).mockResolvedValue(new Response('synthetic-secret-marker-not-json'));
    vi.mocked(fetch).mockResolvedValue(new Response('synthetic-secret-marker-not-json'));
    const status = await localModelStatus();
    expect(status.available).toBe(false);
    expect(status.message).not.toContain('synthetic-secret-marker');
  });

  it('keeps useful checksum errors and never probes an unverified model', async () => {
    vi.mocked(readFile).mockResolvedValue(manifest('0'.repeat(64)));
    expect(await localModelStatus()).toMatchObject({ available: false, message: expect.stringContaining('checksum failed') });
    expect(fetchAiEndpoint).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a model path escaping the verified model root before HTTP', async () => {
    vi.mocked(realpath).mockResolvedValueOnce(root).mockResolvedValueOnce(path.resolve(root, '..', filename));
    expect(await localModelStatus()).toMatchObject({ available: false, message: expect.stringContaining('path escapes') });
    expect(fetchAiEndpoint).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports missing models without returning an HTTP error body', async () => {
    vi.mocked(fetchAiEndpoint).mockResolvedValue(new Response('synthetic-secret-marker', { status: 503 }));
    vi.mocked(fetch).mockResolvedValue(new Response('synthetic-secret-marker', { status: 503 }));
    const status = await localModelStatus();
    expect(status.available).toBe(false);
    expect(status.message).not.toContain('synthetic-secret-marker');
  });

  it('reports an unregistered model before any network request', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ files: [] }));
    expect(await localModelStatus()).toMatchObject({ available: false, message: expect.stringContaining('not registered') });
    expect(fetchAiEndpoint).not.toHaveBeenCalled();
  });

  it('does not confuse a running server with the requested model being loaded', async () => {
    vi.mocked(fetchAiEndpoint).mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'other-model' }] })));
    expect(await localModelStatus()).toMatchObject({ available: false, message: expect.stringContaining('load this version') });
  });
});
