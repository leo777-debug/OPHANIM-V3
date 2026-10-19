import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { INTEGRATIONS } from './catalog';
import { integrationStatus, testIntegration } from './status';

const service = (id: string) => INTEGRATIONS.find(item => item.id === id)!;
describe('server integration status', () => {
  it('never serializes credential values and distinguishes configuration from observation', () => {
    const result = integrationStatus(service('shodan'), { SHODAN_API_KEY: 'secret-not-for-browser' });
    expect(result.status).toBe('Configured');
    expect(result.observation).toBeNull();
    expect(JSON.stringify(result)).not.toContain('secret-not-for-browser');
    expect(integrationStatus(service('shodan'), {}).status).toBe('Not configured');
  });
  it('accepts aliases, alternate credentials and allowlisted keyless local AI', () => {
    expect(integrationStatus(service('supabase'), { NEXT_PUBLIC_SUPABASE_URL: 'url', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public' }).missing).toEqual([]);
    expect(integrationStatus(service('voidaccess'), { VOIDACCESS_API_URL: 'url', VOIDACCESS_API_EMAIL: 'email', VOIDACCESS_API_PASSWORD: 'secret' }).missing).toEqual([]);
    expect(integrationStatus(service('ai'), { AI_BASE_URL: 'http://localhost:11434/v1', AI_MODEL: 'model', AI_LOCAL_BASE_URLS: 'http://localhost:11434' }).missing).toEqual([]);
    expect(integrationStatus(service('ai'), { AI_BASE_URL: 'https://hosted.example/v1', AI_MODEL: 'model' }).missing).toEqual(['AI_API_KEY']);
  });
  it('enforces explicit commercial rights for verification sources', () => {
    expect(integrationStatus(service('metar'), {}).status).toBe('Disabled by licence');
    expect(integrationStatus(service('metar'), { VERIFY_METAR_COMMERCIAL_USE: 'yes' }).status).toBe('Configured');
    expect(integrationStatus(service('verify-observations'), { VERIFY_OBSERVATIONS_COMMERCIAL_USE: 'yes' }).status).toBe('Disabled by licence');
  });
  it('never fetches arbitrary ids, missing credentials, or configuration-only services', async () => {
    const fetcher = vi.fn();
    expect(await testIntegration('https://127.0.0.1', { fetcher })).toBeNull();
    await testIntegration('shodan', { env: {}, fetcher });
    const result = await testIntegration('shodan', { env: { SHODAN_API_KEY: 'private' }, fetcher });
    expect(result?.observation?.scope).toBe('configuration');
    expect(result?.observation?.lastSuccessAt).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('records real reachability only; preserves last success on failure and redacts errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    const success = await testIntegration('usgs', { fetcher, now: () => 10000 });
    expect(success?.observation?.lastSuccessAt).toBe('1970-01-01T00:00:10.000Z');
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
    fetcher.mockRejectedValue(new Error('secret upstream value'));
    const failure = await testIntegration('usgs', { fetcher, now: () => 20000 });
    expect(failure?.status).toBe('Error');
    expect(failure?.observation?.lastSuccessAt).toBe(success?.observation?.lastSuccessAt);
    expect(JSON.stringify(failure)).not.toContain('secret upstream value');
  });
});

describe('central environment inventory', () => {
  it('contains every direct source environment identifier with an empty value', () => {
    const example = readFileSync('.env.example', 'utf8');
    const declared = new Set(example.split(/\r?\n/).filter(line => /^[A-Z]/.test(line)).map(line => {
      expect(line).toMatch(/^[A-Z][A-Z0-9_]*=$/); return line.slice(0, -1);
    }));
    const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(join(directory, item.name)) : /\.tsx?$/.test(item.name) ? [join(directory, item.name)] : []);
    for (const path of walk('src')) for (const match of readFileSync(path, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) expect(declared.has(match[1]), match[1]).toBe(true);
    for (const integration of INTEGRATIONS) for (const name of integration.variables) expect(declared.has(name), name).toBe(true);
  });
});
