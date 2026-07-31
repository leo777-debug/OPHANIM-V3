import { describe, expect, it } from 'vitest';
import { normalizeConflictEvents, normalizeEarthquakes } from './osiris-disruption-normalizer';

describe('existing Ophanim feed normalization', () => {
  it('normalizes evidence-backed conflict events only', () => {
    expect(normalizeConflictEvents({ liveEvents: [{ id: 'event-1', title: 'Red Sea ship attack', url: 'https://example.com/event', timestamp: '2026-01-01T00:00:00Z', lat: 16, lng: 40 }, { id: 'missing-url', title: 'Ignore', lat: 1, lng: 2 }] })).toMatchObject([{ provider: 'osiris-conflicts', disruptionType: 'security', severity: 5 }]);
  });
  it('keeps only materially significant earthquakes', () => {
    expect(normalizeEarthquakes({ earthquakes: [{ id: 'small', magnitude: 4.9, url: 'https://example.com', lat: 1, lng: 2 }, { id: 'major', magnitude: 6.2, place: 'Test', time: 0, url: 'https://example.com/major', lat: 1, lng: 2 }] })).toMatchObject([{ sourceReference: 'major', severity: 4, provider: 'usgs-earthquakes' }]);
  });
});
