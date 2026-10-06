import { describe, expect, it } from 'vitest';
import { createPortResolution, portCandidates } from './ports';

const result = {
  id: 'nominatim:123', label: 'Mumbai Port, Mumbai, India', lat: 18.95, lng: 72.95,
  type: 'harbour', category: 'place', importance: 0.8, zoomLevel: 11, provider: 'nominatim',
  location: { country: 'India' },
};

describe('port resolution contract', () => {
  it('returns candidates without silently selecting one', () => {
    const resolution = createPortResolution('Mumbai', [result, result], 'available');
    expect(resolution).toMatchObject({ query: 'Mumbai', selectionRequired: true, coverage: 'available' });
    expect(resolution.candidates).toEqual([expect.objectContaining({ id: 'nominatim:123', label: 'Mumbai Port, Mumbai, India' })]);
  });

  it('drops results without valid coordinates', () => {
    expect(portCandidates([{ ...result, lat: undefined }])).toEqual([]);
  });
});
