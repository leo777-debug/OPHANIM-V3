import { describe, expect, it } from 'vitest';
import { assessConfidence, classifyConfidence } from './confidence';

describe('deterministic intelligence confidence', () => {
  it('weights identifiers and independent sources above weak context', () => {
    const strong = assessConfidence({ matchStrength: 100, sourceReliability: 85, independentSourceCount: 2, corroboratingSignals: 3, observedAt: '2026-08-01T00:00:00Z', evaluatedAt: '2026-08-02T00:00:00Z' });
    const weak = assessConfidence({ matchStrength: 15, sourceReliability: 40, independentSourceCount: 0, corroboratingSignals: 0, observedAt: '2026-02-01T00:00:00Z', evaluatedAt: '2026-08-02T00:00:00Z', ambiguous: true, sourceChainLabel: 'likely_copy' });
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.level).toBe('high');
    expect(weak.level).toBe('insufficient');
  });

  it('uses stable input time and does not make truth claims', () => {
    const input = { matchStrength: 70, sourceReliability: 70, independentSourceCount: 1, corroboratingSignals: 1, observedAt: '2026-08-01T00:00:00Z', evaluatedAt: '2026-08-04T00:00:00Z' };
    expect(assessConfidence(input)).toEqual(assessConfidence(input));
    expect(classifyConfidence(54)).toBe('low');
  });
});
