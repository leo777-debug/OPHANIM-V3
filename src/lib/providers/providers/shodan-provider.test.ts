import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifySearch } from '../query-classifier';
import { ProviderRegistry } from '../provider-registry';
import { shodanProvider } from './shodan-provider';
import { normalizeHost } from '@/lib/shodan/types';

afterEach(() => vi.unstubAllEnvs());
describe('Shodan deterministic registry integration', () => {
  it.each(['shodan: nginx', 'product:nginx country:AE', 'port:443 org:"Fixture"', 'net:203.0.113.0/24'])('classifies %s without AI or executing a scan', (query) => {
    expect(classifySearch({ query })).toMatchObject({ intent: 'shodan_search', entityType: 'command' });
  });
  it('keeps place queries and natural-language map commands unchanged', () => {
    expect(classifySearch({ query: 'Port Singapore' }).intent).toBe('port_lookup');
    expect(classifySearch({ query: 'Dubai' }).intent).toBe('forward_geocode');
    expect(classifySearch({ query: 'Show ghost ships' }).intent).toBe('map_command');
  });
  it('registers a configured provider and excludes it without credentials', () => {
    const registry = new ProviderRegistry([shodanProvider]), query = classifySearch({ query: 'shodan: nginx' });
    vi.stubEnv('SHODAN_API_KEY', ''); expect(registry.findProviders(query)).toEqual([]);
    vi.stubEnv('SHODAN_API_KEY', 'fixture'); expect(registry.findProviders(query)).toEqual([shodanProvider]);
  });
  it('requires organization context before executing', async () => {
    await expect(shodanProvider.execute!(classifySearch({ query: 'shodan: nginx' }), { signal: new AbortController().signal, locale: 'en' })).rejects.toMatchObject({ code: 'access_denied' });
  });
  it('normalizes an IP with no service banners into a useful host result', () => {
    const host = normalizeHost({ ip_str: '203.0.113.1', org: 'Fixture', ports: [443], last_update: '2026-10-13T08:00:00' }, '203.0.113.1');
    expect(shodanProvider.normalize!(host, { intent: 'ip_lookup', entityType: 'ip', query: host.ip, limit: 1 })[0]).toMatchObject({ provider: 'shodan', label: '203.0.113.1', summary: expect.stringContaining('Fixture') });
  });
});
