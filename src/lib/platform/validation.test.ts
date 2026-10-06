import { describe, expect, it } from 'vitest';
import { key, optionalScore, optionalUrl, uuid } from './validation';

describe('platform validation', () => {
  it('normalizes safe typed values', () => {
    expect(key('Vessel-Record', 'Entity type')).toBe('vessel-record');
    expect(optionalScore('84', 'Confidence')).toBe(84);
    expect(optionalUrl('https://example.test/source', 'Source URL')).toBe('https://example.test/source');
  });

  it('rejects unsafe or malformed values', () => {
    expect(() => key('not a key', 'Entity type')).toThrow('unsupported characters');
    expect(() => optionalScore(101, 'Confidence')).toThrow('integer from 0 to 100');
    expect(() => optionalUrl('javascript:alert(1)', 'Source URL')).toThrow('safe HTTP(S) URL');
    expect(() => uuid('not-a-uuid', 'ID')).toThrow('must be a UUID');
  });
});
