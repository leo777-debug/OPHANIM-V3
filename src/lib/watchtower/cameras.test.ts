import { describe, expect, it } from 'vitest';
import { cameraProvider } from '@/lib/providers/providers/camera-provider';
import catalog from './catalog.json' with { type: 'json' };
import { CAMERA_TYPES, camerasForPort, checkFeed, distanceKm, EMBED_TYPES, parseWindy, portByCode, searchPorts } from './cameras';

describe('Watchtower', () => {
  it('resolves ports and areas, including Arabic names and UN/LOCODEs', () => {
    expect(searchPorts('Fujairah anchorage')[0].code).toBe('AEFJR');
    expect(searchPorts('Jebel Ali gate')[0].code).toBe('AEJEA');
    expect(searchPorts('Shahid Rajaee')[0].code).toBe('IRBND');
    expect(searchPorts('IRZBR')[0].name).toBe('Chabahar');
    expect(searchPorts('خورفكان')[0].code).toBe('AEKLF');
    expect(searchPorts('Rotterdam')).toEqual([]);
  });

  it('keeps the catalogue honest: valid types, source and terms on every feed, no stream URL on unverified leads', () => {
    for (const feed of catalog.feeds) {
      expect(CAMERA_TYPES).toContain(feed.type); expect(EMBED_TYPES).toContain(feed.embedType);
      expect(feed.sourceUrl).toMatch(/^https:\/\//); expect(feed.terms.length).toBeGreaterThan(10);
      if (feed.status === 'unverified') expect(feed.streamUrl).toBeNull();
      expect(portByCode(feed.port)).toBeTruthy();
    }
  });

  it('never presents an empty or unconfigured result as an all-clear', async () => {
    const result = await camerasForPort(portByCode('IRBND')!, new Map(), { windy: async () => [] });
    expect(result.live).toBe(0);
    expect(result.warnings).toContain('No live public view of this port right now. This is not an all-clear.');
    expect(result.feeds.every(feed => feed.status === 'unverified')).toBe(true);
  });

  it('parses aggregator webcams with distance from the port and drops non-https players', () => {
    const port = portByCode('AEKLF')!;
    const feeds = parseWindy({ webcams: [
      { webcamId: 101, title: 'Corniche view', status: 'active', lastUpdatedOn: '2026-10-21T08:00:00Z', location: { latitude: 25.34, longitude: 56.35 }, player: { day: 'https://webcams.windy.com/webcams/public/embed/player/101/day' }, urls: { detail: 'https://www.windy.com/webcams/101' } },
      { webcamId: 102, title: 'Insecure', status: 'active', location: { latitude: 25.3, longitude: 56.3 }, player: { day: 'http://example.test/player' } },
    ] }, port);
    expect(feeds).toHaveLength(1);
    expect(feeds[0]).toMatchObject({ id: 'windy-101', status: 'live', embedType: 'iframe', provider: 'windy' });
    expect(feeds[0].distanceKm).toBe(distanceKm(port, { lat: 25.34, lon: 56.35 }));
  });

  it('health check marks live feeds and prunes a feed after three failures', async () => {
    const feed = { id: 'f1', streamUrl: 'https://cams.example.test/snap.jpg', embedType: 'snapshot' as const };
    const ok = await checkFeed(feed, undefined, Date.parse('2026-10-21T08:00:00Z'), async () => new Response('x', { status: 200 }));
    expect(ok).toMatchObject({ status: 'live', failures: 0, lastSeen: '2026-10-21T08:00:00.000Z' });
    let state = ok;
    for (let index = 0; index < 3; index++) state = await checkFeed(feed, state, Date.parse('2026-10-21T09:00:00Z') + index, async () => new Response('', { status: 404 }));
    expect(state).toMatchObject({ status: 'dead', failures: 3, lastSeen: '2026-10-21T08:00:00.000Z' });
    expect((await checkFeed({ id: 'lead', streamUrl: null, embedType: 'iframe' }, undefined)).status).toBe('unverified');
  });

  it('is registered as a camera provider with map pins for the priority ports', async () => {
    expect(cameraProvider.metadata.category).toBe('camera');
    expect(cameraProvider.supports!({ intent: 'forward_geocode', entityType: 'location', query: 'Bandar Abbas', limit: 5 })).toBe(true);
    const layers = await cameraProvider.createMapLayers!({ signal: new AbortController().signal });
    expect(layers[0].source.features).toHaveLength(catalog.ports.length);
  });
});
