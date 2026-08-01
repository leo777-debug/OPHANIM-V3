import { describe, expect, it } from 'vitest';
import { DisruptionValidationError, validateDisruptionInput } from './disruption-validation';

describe('disruption validation', () => {
  const valid = { source: 'Port authority', title: 'Terminal closure', disruptionType: 'port_closure', severity: 4, latitude: 51.95, longitude: 4.14, affectedPorts: ['NLRTM'], evidence: [{ sourceName: 'Port authority', title: 'Notice', sourceUrl: 'https://example.com/notice' }] };

  it('accepts an evidence-backed disruption record', () => {
    expect(validateDisruptionInput(valid)).toMatchObject({ status: 'active', affectedPorts: ['NLRTM'] });
  });

  it('requires paired coordinates and safe evidence URLs', () => {
    expect(() => validateDisruptionInput({ ...valid, longitude: undefined })).toThrow(DisruptionValidationError);
    expect(() => validateDisruptionInput({ ...valid, evidence: [{ ...valid.evidence[0], sourceUrl: 'file:///tmp/notice' }] })).toThrow(DisruptionValidationError);
  });
});
