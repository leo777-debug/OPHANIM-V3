import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyClaim } from './service';
import { VERIFY_FIXTURES } from './fixtures';
import { CHECKER_PROVIDERS } from './checkers';
import { IntelligenceEventProviderRegistry, collectIntelligenceEvents } from '@/lib/intelligence/event-provider-registry';
import { observationsProvider, airportWeatherProvider } from './providers';
afterEach(() => vi.unstubAllEnvs());
describe('Verify provider orchestration', () => {
  it('selects an explicit deterministic allowlist and lists failed sources', async () => {
    const collect = vi.fn(async () => ({ events: [], diagnostics: [{ providerId: 'usgs-earthquakes', status: 'error' as const, eventCount: 0, durationMs: 1, message: 'Offline' }] }));
    const result = await verifyClaim(VERIFY_FIXTURES[1].claim, {}, collect);
    expect(collect).toHaveBeenCalledWith(expect.objectContaining({ providerIds: CHECKER_PROVIDERS.earthquake }));
    expect(result.verdict).toBe('NOT CONFIRMED YET'); expect(result.couldNotCheck[0].reason).toBe('Offline');
  });
  it('opinion and replay make no live provider calls', async () => {
    const collect = vi.fn(); await verifyClaim(VERIFY_FIXTURES[4].claim, {}, collect);
    const replay = await verifyClaim(null, { fixture: 'dubai-fog' }, collect);
    expect(collect).not.toHaveBeenCalled(); expect(replay.mode).toBe('replay'); expect(replay.replay?.provenance).toBe('synthetic_test_fixture'); expect(replay.verdict).toBe('PARTLY TRUE');
  });
  it('unknown/disallowed licences keep new providers off', async () => {
    vi.stubEnv('VERIFY_OBSERVATIONS_COMMERCIAL_USE', 'unknown'); vi.stubEnv('VERIFY_OBSERVATIONS_URL', 'https://example.com');
    const registry = new IntelligenceEventProviderRegistry([observationsProvider]);
    const result = await collectIntelligenceEvents({ providerIds: ['verify-observations'] }, registry);
    expect(result.diagnostics[0].status).toBe('skipped'); expect(registry.catalog()[0].warning).toContain('Disabled');
    expect(registry.selected()).toHaveLength(0);
  });
  it('international METAR stays off until rights are reviewed', () => {
    vi.stubEnv('VERIFY_METAR_COMMERCIAL_USE', ''); expect(airportWeatherProvider.compliance!().commercialUse).toBe('unknown');
    vi.stubEnv('VERIFY_METAR_COMMERCIAL_USE', 'yes'); expect(airportWeatherProvider.compliance!().commercialUse).toBe('yes');
  });
  it('normalizes METAR times and visibility without inventing closures', () => {
    const events = airportWeatherProvider.normalize([{ icaoId: 'OMDB', obsTime: 1791531000, lat: 25.2532, lon: 55.3657, visib: .3, wxString: 'FG' }], { signal: new AbortController().signal, now: new Date(), since: new Date(), limit: 10 });
    expect(events[0].eventType).toBe('airport_weather'); expect(events[0].attributes.lowVisibility).toBe(true); expect(events[0].attributes.closed).toBeUndefined();
  });
  it('a broken source configuration does not block another source', async () => {
    const bad = { ...airportWeatherProvider, id: 'broken-config', isConfigured: () => { throw new Error('Bad configuration'); } };
    const good = { ...airportWeatherProvider, id: 'good-source', compliance: undefined, fetch: async () => [], normalize: () => VERIFY_FIXTURES[1].events };
    const result = await collectIntelligenceEvents({ providerIds: ['broken-config', 'good-source'] }, new IntelligenceEventProviderRegistry([bad, good]));
    expect(result.diagnostics.map((item) => item.status)).toEqual(['error', 'success']); expect(result.events).toHaveLength(1);
  });
});
