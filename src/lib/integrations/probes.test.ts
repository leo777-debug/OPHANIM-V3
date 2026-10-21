import { describe, expect, it } from 'vitest';
import { connectionProbe } from './probes';
import { INTEGRATIONS } from './catalog';
const service = (id: string) => INTEGRATIONS.find(item => item.id === id)!;
describe('registered connection adapters', () => {
  it('uses read-only model discovery with server credentials and no prompt execution', () => {
    const probe = connectionProbe(service('ai'), { AI_BASE_URL: 'https://model.example/v1', AI_API_KEY: 'test-only' });
    expect(probe?.url).toBe('https://model.example/v1/models');
    expect(probe?.headers).toEqual({ Authorization: 'Bearer test-only' }); expect(probe?.body).toBeUndefined();
  });
  it('supports aliases, optional worker health paths and configuration-only reserved adapters', () => {
    expect(connectionProbe(service('supabase'), { NEXT_PUBLIC_SUPABASE_URL: 'https://project.example', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public' })?.url).toBe('https://project.example/auth/v1/health');
    expect(connectionProbe(service('research'), { AI_SANDBOX_RESEARCH_URL: 'http://sandbox:8080', AI_SANDBOX_RESEARCH_TOKEN: 'test-only' })?.url).toBe('http://sandbox:8080/health');
    expect(connectionProbe(service('research'), { AI_SANDBOX_RESEARCH_URL: 'https://sandbox.example/private?ignored=yes#fragment', AI_SANDBOX_RESEARCH_TOKEN: 'test-only' })).toMatchObject({ url: 'https://sandbox.example/private/health', expected: 'json' });
    expect(connectionProbe(service('n2yo'), {})).toBeNull();
  });
  it('keeps hosted, embedding and keyless local credentials separate', () => {
    const env = { AI_BASE_URL: 'https://hosted.example/v1', AI_API_KEY: 'hosted-fixture',
      EMBEDDING_BASE_URL: 'https://vectors.example/v1', EMBEDDING_API_KEY: 'embedding-fixture',
      OPHANIM_LOCAL_BASE_URL: 'http://localhost:11434/v1' };
    expect(connectionProbe(service('ai'), env)?.headers).toEqual({ Authorization: 'Bearer hosted-fixture' });
    expect(connectionProbe(service('embeddings'), env)?.headers).toEqual({ Authorization: 'Bearer embedding-fixture' });
    expect(connectionProbe(service('local-model'), env)).toMatchObject({ url: 'http://localhost:11434/v1/models', headers: {} });
    expect(connectionProbe(service('embeddings'), { ...env, EMBEDDING_API_KEY: undefined })?.headers).toEqual({});
  });
  it('normalizes discovery URLs and rejects credentials before transport', () => {
    expect(connectionProbe(service('ai'), { AI_BASE_URL: 'https://hosted.example/proxy/v1/chat/completions/?secret=discarded', AI_API_KEY: 'fixture' })?.url)
      .toBe('https://hosted.example/proxy/v1/models');
    for (const base of ['invalid URL', 'https://user:password@hosted.example/v1', 'file:///models']) {
      expect(() => connectionProbe(service('ai'), { AI_BASE_URL: base })).toThrow();
    }
    expect(() => connectionProbe(service('ai'), { AI_BASE_URL: 'https://hosted.example', AI_API_KEY: 'fixture\r\ninjected' })).toThrow();
  });
});
