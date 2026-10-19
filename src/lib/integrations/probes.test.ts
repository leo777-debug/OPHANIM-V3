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
    expect(connectionProbe(service('n2yo'), {})).toBeNull();
  });
});
