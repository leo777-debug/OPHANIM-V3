import { describe, expect, it } from 'vitest';
import { mockDarkWebProvider } from './mock-provider';

describe('development dark-web provider', () => {
  it('returns only safe fixture data for an exact identifier', async () => {
    const controller = new AbortController();
    const results = await mockDarkWebProvider.search({ query: '9123456', entityTypes: ['vessel'], limit: 10 }, { signal: controller.signal, organizationId: 'test' });
    expect(results.some((result) => result.providerDocumentId === 'fixture-imo')).toBe(true);
    expect(mockDarkWebProvider.metadata.sourceCategories).toEqual(['development_fixture']);
  });
  it('rejects unsafe references during normalization', () => {
    const mention = mockDarkWebProvider.normalize({ providerDocumentId: 'x', sourceCategory: 'development_fixture', sourceName: 'fixture', sourceReference: 'http://unsafe.invalid', firstSeenAt: '2026-01-01T00:00:00Z', lastSeenAt: '2026-01-01T00:00:00Z', originalText: '<b>safe</b>', sourceReliability: 1, threatCategories: [] });
    expect(mention.sourceReference).toBeUndefined();
    expect(mention.originalText).toBe('safe');
  });
});
