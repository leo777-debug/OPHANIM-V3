import { describe, expect, it } from 'vitest';
import { makePublicSnapshot } from './offline-snapshot';
import { SPECIALIST_SOURCES, normalizeSpecialist } from './specialist-providers';
const source = SPECIALIST_SOURCES.find(item => item.id === 'cdc-travel-health')!;
const [notice] = normalizeSpecialist(source, { payload: [{ title: '<img src=x onerror=alert(1)>Notice', contentSnippet: 'Official text', link: 'https://wwwnc.cdc.gov/travel/notices/example', pubDate: '2026-10-19T10:00:00Z' }], fetchedAt: '2026-10-20T10:00:00Z', mode: 'fresh', staleSince: null }, 10);
describe('offline public snapshot boundary', () => {
  it('drops private scope, unregistered providers and arbitrary extra fields', () => {
    const data = makePublicSnapshot([
      { ...notice, attributes: { ...notice.attributes, apiKey: 'must-not-persist', shipmentId: 'private' } },
      { ...notice, organizationScope: 'other-organization' },
      { ...notice, providerId: 'private-sdk' },
    ], '2026-10-20T10:00:00Z', '2026-10-20T11:00:00Z');
    expect(data.events).toHaveLength(1); expect(JSON.stringify(data)).not.toMatch(/must-not-persist|shipmentId|other-organization/);
    expect(data.mode).toContain('not current'); expect(data.events[0].retrievedAt).toBe('2026-10-20T10:00:00.000Z');
  });
  it('caps records and rejects links outside the official host allowlist', () => {
    const unsafe = { ...notice, sources: [{ ...notice.sources[0], url: 'https://secret@example.com/private?token=x' }] };
    const data = makePublicSnapshot(Array.from({ length: 200 }, () => unsafe), '2026-10-20T10:00:00Z');
    expect(data.events).toHaveLength(150); expect(data.events.every(event => event.sourceUrl === '')).toBe(true);
    expect(() => makePublicSnapshot([], 'unknown')).toThrow('timestamps');
  });
});
