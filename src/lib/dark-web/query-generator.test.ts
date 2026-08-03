import { describe, expect, it } from 'vitest';
import { generateDarkWebQueries } from './query-generator';

describe('dark-web query generation', () => {
  it('is deterministic, bounded, and uses strong vessel identifiers', () => {
    const queries = generateDarkWebQueries({ id: 'vessel', entityType: 'vessel', canonicalName: 'Example Star', normalizedKey: 'example-star', attributes: {}, aliases: [{ alias: '9123456', identifierType: 'imo', identifierValue: '9123456' }] }, { maxQueriesPerEntity: 4, priority: 'high' });
    expect(queries).toHaveLength(4);
    expect(queries.some((query) => query.query === '9123456')).toBe(true);
    expect(new Set(queries.map((query) => query.query.toLowerCase())).size).toBe(queries.length);
  });
});
