import { describe, expect, it } from 'vitest';
import { findReferences } from './identifiers';
import { matchReferences, type KeyRingEntry } from './matching';

const ring: KeyRingEntry[] = [
  { jobFileId: 'j1', jobNumber: 'JF-1001', type: 'awb', normalizedValue: '176-12345675' },
  { jobFileId: 'j1', jobNumber: 'JF-1001', type: 'invoice', normalizedValue: 'INV-77' },
  { jobFileId: 'j2', jobNumber: 'JF-1002', type: 'invoice', normalizedValue: 'INV-88' },
  { jobFileId: 'j3', jobNumber: 'JF-1003', type: 'container', normalizedValue: 'CSQU3054383' },
  { jobFileId: 'j4', jobNumber: 'JF-1004', type: 'container', normalizedValue: 'CSQU3054383' },
];

describe('reference matching', () => {
  it('attaches to the single job holding a strong reference', () => {
    const decision = matchReferences(findReferences('Pre-alert MAWB 176-12345675 attached'), ring);
    expect(decision).toMatchObject({ status: 'matched', jobFileId: 'j1', reason: 'single_strong_match' });
    expect(decision.candidates[0].reasons[0]).toContain("AWB 176-12345675 is on JF-1001's key ring");
  });
  it('sends ambiguous documents to review with reasons for each candidate', () => {
    const decision = matchReferences(findReferences('Container CSQU3054383 gated in'), ring);
    expect(decision).toMatchObject({ status: 'review', jobFileId: null, reason: 'ambiguous' });
    expect(decision.candidates.map(candidate => candidate.jobNumber)).toEqual(['JF-1003', 'JF-1004']);
  });
  it('sends weak and unmatched documents to review', () => {
    expect(matchReferences(findReferences('Invoice No: INV-88'), ring)).toMatchObject({ status: 'review', reason: 'weak' });
    expect(matchReferences(findReferences('Hello, see attached photo'), ring)).toMatchObject({ status: 'review', reason: 'no_match', candidates: [] });
  });
});
