import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAiConfig } from './config';
import { AI_CONFIG_STORAGE, readClientAiConfig, writeClientAiConfig } from './client-config';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('central server AI credentials', () => {
  it('does not attach server credentials to browser-selected hosts', () => {
    vi.stubEnv('AI_BASE_URL', 'https://trusted.example/v1'); vi.stubEnv('AI_MODEL', 'model'); vi.stubEnv('AI_API_KEY', 'server-test-only');
    expect(resolveAiConfig({ apiKey: 'client-secret', baseUrl: 'https://attacker.example', model: 'other', enabledTasks: [] })).toMatchObject({ baseUrl: 'https://trusted.example/v1', apiKey: 'server-test-only' });
    vi.stubEnv('AI_BASE_URL', ''); expect(resolveAiConfig({ apiKey: 'client-secret', baseUrl: 'http://localhost:11434/v1', model: 'local', enabledTasks: [] })?.apiKey).toBe('');
  });
  it('strips credentials when migrating browser preferences and writing them', () => {
    const records = new Map<string, string>();
    vi.stubGlobal('window', {}); vi.stubGlobal('sessionStorage', { getItem: (key: string) => records.get(key), setItem: (key: string, value: string) => records.set(key, value), removeItem: (key: string) => records.delete(key) });
    const config = { apiKey: 'browser-secret-test', baseUrl: 'http://localhost:11434/v1', model: 'local', enabledTasks: [] };
    records.set(AI_CONFIG_STORAGE, JSON.stringify(config)); expect(readClientAiConfig()?.apiKey).toBe('');
    expect(records.get(AI_CONFIG_STORAGE)).not.toContain('browser-secret-test');
    writeClientAiConfig(config); expect(records.get(AI_CONFIG_STORAGE)).not.toContain('browser-secret-test');
  });
});
