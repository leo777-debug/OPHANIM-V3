import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShodanClient } from './client';

const service = { ip_str: '203.0.113.1', port: 443, org: 'Fixture org', hostnames: ['fixture.example'], product: 'nginx', transport: 'tcp',
  location: { latitude: 25, longitude: 55, country_name: 'UAE' }, timestamp: '2026-10-13T08:00:00', data: 'x'.repeat(2000) };
const info = { query_credits: 2, scan_credits: 12, plan: 'fixture' };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function setup(responses: Response[], extra: ConstructorParameters<typeof ShodanClient>[1] = {}) {
  const http = vi.fn<typeof fetch>();
  responses.forEach((response) => http.mockResolvedValueOnce(response));
  return { http, client: new ShodanClient('fixture-secret', { fetch: http, intervalMs: 0, ...extra }) };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('Shodan client (mocked HTTP only)', () => {
  it('fails clearly without a key and never calls HTTP', async () => {
    const http = vi.fn<typeof fetch>();
    await expect(new ShodanClient('', { fetch: http }).host('203.0.113.1')).rejects.toMatchObject({ code: 'missing_key', status: 503 });
    expect(http).not.toHaveBeenCalled();
  });
  it('normalizes searches, facets, pagination and low-credit warnings', async () => {
    const { client, http } = setup([reply(info), reply({ matches: [service], total: 120, facets: { port: [{ value: 443, count: 120 }] } })]);
    const result = await client.search('product:nginx country:AE', 'port,org,country', 2);
    expect(result).toMatchObject({ total: 120, page: 2, facets: { port: [{ value: 443, count: 120 }] }, matches: [{ ip_str: '203.0.113.1', port: 443, product: 'nginx', location: { latitude: 25 } }] });
    expect(result.matches[0].data.length).toBe(1000);
    expect(result.warnings).toEqual(['Shodan query credits are low (2 remaining).']);
    const url = new URL(String(http.mock.calls[1][0]));
    expect(url.origin).toBe('https://api.shodan.io');
    expect(url.searchParams.get('query')).toBe('product:nginx country:AE');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('facets')).toBe('port,org,country');
    expect(url.searchParams.get('key')).toBe('fixture-secret');
  });
  it('caches counts without requesting credit information', async () => {
    const { client, http } = setup([reply({ total: 12, facets: {} })]);
    expect(await client.count('port:443')).toEqual({ total: 12, facets: {} });
    await client.count('port:443');
    expect(http).toHaveBeenCalledTimes(1);
    expect(new URL(String(http.mock.calls[0][0])).pathname).toBe('/shodan/host/count');
  });
  it('normalizes host details, options and vulnerabilities with caching', async () => {
    const { client, http } = setup([reply({ ...service, isp: 'Fixture ISP', asn: 'AS123', os: 'Linux', ports: [443], last_update: service.timestamp, vulns: { 'CVE-2026-1': {} }, data: [service] })]);
    const host = await client.host('203.0.113.1', true, false);
    expect(host).toMatchObject({ ip: '203.0.113.1', ports: [443], isp: 'Fixture ISP', asn: 'AS123', os: 'Linux', vulns: ['CVE-2026-1'], services: [{ product: 'nginx' }] });
    await client.host('203.0.113.1', true, false);
    expect(http).toHaveBeenCalledTimes(1);
    expect(new URL(String(http.mock.calls[0][0])).searchParams.get('history')).toBe('true');
  });
  it('expires cached results and separates history/minify cache keys', async () => {
    let now = 100;
    const { client, http } = setup([reply({ ports: [80] }), reply({ ports: [443] }), reply({ ports: [22] })], { cacheTtlMs: 50, clock: () => now });
    await client.host('203.0.113.1'); now += 51;
    expect((await client.host('203.0.113.1')).ports).toEqual([443]);
    await client.host('203.0.113.1', true, true);
    expect(http).toHaveBeenCalledTimes(3);
  });
  it('deduplicates concurrent count requests', async () => {
    const { client, http } = setup([reply({ total: 3 })]);
    await Promise.all([client.count('nginx'), client.count('nginx')]);
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('accepts a batch and keeps host-not-found results without hiding other hosts', async () => {
    const { client } = setup([reply({ ports: [443], data: [service] }), reply({ error: 'No information' }, 404)]);
    const batch = await client.hosts('203.0.113.1,203.0.113.2');
    expect(batch.results[0]).toHaveProperty('host');
    expect(batch.results[1]).toMatchObject({ ip: '203.0.113.2', code: 'no_information' });
  });
  it('resolves and reverse-resolves using Shodan DNS endpoints', async () => {
    const { client, http } = setup([reply({ 'fixture.example': '203.0.113.1' }), reply({ '203.0.113.1': ['fixture.example'] })]);
    expect(await client.resolve('fixture.example')).toEqual({ 'fixture.example': '203.0.113.1' });
    expect(await client.reverse('203.0.113.1')).toEqual({ '203.0.113.1': ['fixture.example'] });
    expect(http.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(['/dns/resolve', '/dns/reverse']);
  });
  it.each([[401, 'invalid_key'], [403, 'access_denied'], [404, 'no_information'], [402, 'insufficient_credits'], [400, 'invalid_request']])('maps HTTP %s without leaking upstream errors', async (status, code) => {
    const { client } = setup([reply({ error: 'fixture-secret URL and upstream details' }, status as number)]);
    const error = await client.host('203.0.113.1').catch((value) => value);
    expect(error.code).toBe(code);
    expect(error.message).not.toContain('fixture-secret');
    expect(error.message).not.toContain('upstream details');
  });
  it.each([429, 503])('backs off on HTTP %s and retries read operations only', async (status) => {
    vi.useFakeTimers();
    const { client, http } = setup([reply({}, status), reply({}, status), reply({ total: 4 })]);
    const pending = client.count('nginx');
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ total: 4 });
    expect(http).toHaveBeenCalledTimes(3);
  });
  it('spaces simultaneous upstream requests by one second', async () => {
    vi.useFakeTimers();
    const calls: number[] = [], http = vi.fn<typeof fetch>(async () => { calls.push(Date.now()); return reply({}); });
    const client = new ShodanClient('fixture-secret', { fetch: http, intervalMs: 1000 });
    const pending = Promise.all([client.host('203.0.113.1'), client.host('203.0.113.2')]);
    await vi.runAllTimersAsync(); await pending;
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(1000);
  });
  it('submits one confirmed allowlisted scan and returns its ID/credits/status', async () => {
    const { client, http } = setup([reply(info), reply({ id: 'fixture-scan', count: 1, credits_left: 11 })]);
    expect(await client.submitAuthorizedScan(['203.0.113.1'], 1, ['203.0.113.0/24'], true)).toMatchObject({ id: 'fixture-scan', count: 1, credits_left: 11, status: 'SUBMITTING' });
    expect(http.mock.calls[1][1]?.method).toBe('POST');
    expect(String(http.mock.calls[1][1]?.body)).toBe('ips=203.0.113.1');
  });
  it('rejects unauthorized or unconfirmed targets before fetching', async () => {
    const { client, http } = setup([]);
    await expect(client.submitAuthorizedScan(['203.0.113.1'], 1, ['198.51.100.0/24'], true)).rejects.toMatchObject({ code: 'unauthorized_target' });
    await expect(client.submitAuthorizedScan(['203.0.113.1'], 1, ['203.0.113.0/24'], false)).rejects.toMatchObject({ code: 'confirmation_required' });
    expect(http).not.toHaveBeenCalled();
  });
  it('blocks a scan with insufficient credits', async () => {
    const { client, http } = setup([reply({ ...info, scan_credits: 0 })]);
    await expect(client.submitAuthorizedScan(['203.0.113.1'], 1, ['203.0.113.0/24'], true)).rejects.toMatchObject({ code: 'insufficient_credits' });
    expect(http).toHaveBeenCalledTimes(1);
  });
  it.each([429, 503])('never retries a scan POST after HTTP %s', async (status) => {
    const { client, http } = setup([reply(info), reply({}, status)]);
    await expect(client.submitAuthorizedScan(['203.0.113.1'], 1, ['203.0.113.0/24'], true)).rejects.toBeDefined();
    expect(http).toHaveBeenCalledTimes(2);
  });
  it('polls status and normalizes DONE', async () => {
    const { client, http } = setup([reply({ id: 'fixture-scan', status: 'DONE', count: 2, created: service.timestamp })]);
    expect(await client.scanStatus('fixture-scan')).toMatchObject({ id: 'fixture-scan', status: 'DONE', count: 2 });
    expect(new URL(String(http.mock.calls[0][0])).pathname).toBe('/shodan/scan/fixture-scan');
  });
  it('does not expose credential-bearing network exceptions or response strings', async () => {
    const http = vi.fn<typeof fetch>().mockRejectedValue(new Error('https://api.shodan.io?key=fixture-secret'));
    const client = new ShodanClient('fixture-secret', { fetch: http, intervalMs: 0 });
    await expect(client.info()).rejects.toMatchObject({ code: 'provider_down' });
    const { client: successful } = setup([reply({ data: [{ ...service, data: 'fixture-secret' }] })]);
    expect(JSON.stringify(await successful.host('203.0.113.1'))).not.toContain('fixture-secret');
  });
  it('rejects malformed IPs, hostnames, scan IDs and pagination', async () => {
    const { client, http } = setup([]);
    await expect(client.host('http://localhost/')).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(client.resolve('example.com/?key=x')).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(client.scanStatus('../scan/internet')).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(client.search('nginx', '', 0)).rejects.toMatchObject({ code: 'invalid_request' });
    expect(http).not.toHaveBeenCalled();
  });
});
