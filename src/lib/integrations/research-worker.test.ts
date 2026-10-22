import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createResearchEngine, createResearchServer, fetchOfficialJson, publicAddress } from '../../../ops/research/service.mjs';
import sources from '../intelligence/research-sources.json';
import { intelligenceEventProviderRegistry } from '../intelligence/event-provider-registry';
import { INTEGRATIONS } from './catalog';

const servers: Server[] = [];
const token = 'synthetic-worker-token-for-local-tests-only';
const policy = { allowOperationalActions: false, requireSourceAttribution: true };
const input = { subject: 'Dubai earthquake', purpose: 'confirm', context: 'private synthetic shipment note', policy };
const payload = (url: string) => ({ type: 'FeatureCollection', features: url.includes('earthquake')
  ? [{ properties: { title: 'M 4.5 earthquake near Dubai', place: 'Dubai', time: 1000, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/fixture' } }]
  : [{ id: 'https://api.weather.gov/alerts/fixture', properties: { headline: '<b>Dubai fixture weather notice</b>', sent: '1970-01-01T00:00:02Z', description: 'Synthetic fixture, not real weather.' } }] });
afterEach(async () => { for (const server of servers.splice(0)) await new Promise<void>((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
}); });
async function start(options: Parameters<typeof createResearchServer>[0] = { token }) {
  const server = createResearchServer(options); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server failed.');
  return `http://127.0.0.1:${address.port}`;
}
describe('restricted official-feed worker', () => {
  it('uses the registered commercially permitted sources and rejects arbitrary fetch destinations', async () => {
    const catalog = intelligenceEventProviderRegistry.catalog();
    for (const source of sources) {
      expect(catalog.find(provider => provider.id === source.id)?.compliance).toMatchObject({ commercialUse: 'yes', license: source.licence });
      expect(INTEGRATIONS.find(item => item.id === (source.id === 'usgs-earthquakes' ? 'usgs' : source.id))?.licence?.commercialUse).toBe('yes');
      expect(source.keyNeeded).toBe(false);
    }
    await expect(fetchOfficialJson('http://169.254.169.254/latest/meta-data/')).rejects.toThrow('not permitted');
    await expect(fetchOfficialJson('https://unreviewed.example/feed')).rejects.toThrow('not permitted');
    for (const address of ['127.0.0.1', '10.20.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1', '2001:db8::1']) expect(publicAddress(address)).toBe(false);
    for (const address of ['8.8.8.8', '2606:4700:4700::1111']) expect(publicAddress(address)).toBe(true);
  });
  it('keeps context and query private, deduplicates source requests, and preserves dates/attribution', async () => {
    let now = 10000;
    const fetcher = vi.fn(async (url: string) => payload(url));
    const research = createResearchEngine({ fetcher, now: () => now });
    const [result, repeated] = await Promise.all([research(input), research(input)]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const args of fetcher.mock.calls) expect(args).toHaveLength(1);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain(input.context);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain(input.subject);
    expect(result).toEqual(repeated); expect(result.sources).toHaveLength(2);
    expect(result).toMatchObject({ riskIndicator: 'unknown', method: 'deterministic-keyword-overlap', collectedAt: '1970-01-01T00:00:10.000Z' });
    expect(result.sources[0].trustTier).toBe('official');
    expect(result.sources.some((source: { publishedAt: string }) => source.publishedAt === '1970-01-01T00:00:01.000Z')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('<b>');
    now += 300001; await research(input); expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('shows unavailable coverage honestly, caches failures and rejects operational requests', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('private upstream error'));
    const research = createResearchEngine({ fetcher });
    const result = await research(input); await research(input);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ riskIndicator: 'unknown', sources: [], collectedAt: null });
    expect(result.summary).toContain('2 feeds unavailable');
    expect(JSON.stringify(result)).not.toContain('private upstream');
    await expect(research({ ...input, policy: { ...policy, allowOperationalActions: true } })).rejects.toThrow();
    await expect(research({ ...input, subject: 'x'.repeat(501) })).rejects.toThrow();
  });
  it('requires configured authentication even for health and never researches during health tests', async () => {
    const research = vi.fn();
    const unavailable = await start({ token: '', research });
    expect((await fetch(unavailable + '/health')).status).toBe(503);
    const origin = await start({ token, research });
    expect((await fetch(origin + '/health')).status).toBe(401);
    const response = await fetch(origin + '/health', { headers: { Authorization: `Bearer ${token}` } });
    expect(await response.json()).toMatchObject({ status: 'ready', mode: 'restricted-official-feeds', upstreamTested: false });
    expect(research).not.toHaveBeenCalled();
    expect((await fetch(origin + '/other', { headers: { Authorization: `Bearer ${token}` } })).status).toBe(404);
  });
  it('serves bounded authenticated research over HTTP and enforces rate/content limits', async () => {
    const engine = createResearchEngine({ fetcher: async (url: string) => payload(url), now: () => 10000 });
    const research = vi.fn(engine);
    const origin = await start({ token, research });
    const post = (body: string, contentType = 'application/json') => fetch(origin + '/v1/research', { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body });
    expect((await post('{}', 'text/plain')).status).toBe(415);
    expect((await post('invalid-json')).status).toBe(400);
    expect((await post('x'.repeat(16001))).status).toBe(413);
    const response = await post(JSON.stringify(input));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).sources).toHaveLength(2);
    for (let index = 0; index < 16; index++) await post('{}');
    expect((await post(JSON.stringify(input))).status).toBe(429);
    expect(research).toHaveBeenCalledTimes(17);
  });
});
