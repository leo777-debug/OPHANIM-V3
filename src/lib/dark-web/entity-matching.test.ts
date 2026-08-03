import { describe, expect, it } from 'vitest';
import { matchMentionEntities } from './entity-matching';
import type { NormalizedMention, RegisteredEntity } from './types';

const mention: NormalizedMention = { providerId: 'fixture', providerDocumentId: 'one', sourceCategory: 'development_fixture', sourceName: 'fixture', firstSeenAt: '2026-01-01T00:00:00Z', lastSeenAt: '2026-01-01T00:00:00Z', originalText: 'Example mentions IMO 9123456.', sourceReliability: 20, threatCategories: [], contentHash: 'a'.repeat(64), reviewStatus: 'new', sourceChainLabel: 'relationship_unknown', independentSourceCount: 0 };
describe('deterministic entity matching', () => {
  it('uses an exact IMO before a weak vessel-name match', () => {
    const entities: RegisteredEntity[] = [{ id: 'vessel', entityType: 'vessel', canonicalName: 'Example Star', normalizedKey: 'example-star', attributes: {}, aliases: [{ alias: '9123456', identifierType: 'imo', identifierValue: '9123456' }] }, { id: 'name', entityType: 'company', canonicalName: 'Example', normalizedKey: 'example', attributes: {}, aliases: [] }];
    const matches = matchMentionEntities(mention, entities);
    expect(matches[0]).toMatchObject({ entityId: 'vessel', matchMethod: 'exact_imo', confidenceContribution: 100, requiresReview: false });
    expect(matches.find((match) => match.entityId === 'name')).toMatchObject({ matchMethod: 'weak_name', requiresReview: true });
  });
});
