import { describe, expect, it } from 'vitest';
import { assessSourceChain } from './deduplication';
import type { NormalizedMention } from './types';

describe('source-chain detection', () => {
  it('marks exact normalized content as a likely copy without claiming an original', () => {
    const mention: NormalizedMention = { providerId: 'fixture', providerDocumentId: 'two', sourceCategory: 'development_fixture', sourceName: 'fixture', firstSeenAt: '2026-01-01T00:00:00Z', lastSeenAt: '2026-01-01T00:00:00Z', originalText: 'same', sourceReliability: 10, threatCategories: [], contentHash: 'b'.repeat(64), reviewStatus: 'new', sourceChainLabel: 'relationship_unknown', independentSourceCount: 0 };
    expect(assessSourceChain(mention, [{ id: 'one', contentHash: 'b'.repeat(64), originalText: 'same', sourceName: 'another fixture' }])).toMatchObject({ label: 'likely_copy', anchorMentionId: 'one' });
  });
});
