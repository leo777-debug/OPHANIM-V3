import { describe, expect, it } from 'vitest';
import { RescueValidationError, validateRescueActionInput, validateRescueCaseInput, validateRescueEvidenceInput } from './rescue-validation';

describe('rescue workflow validation', () => {
  const shipmentId = '550e8400-e29b-41d4-a716-446655440000';
  it('accepts a bounded recovery case and proposed action', () => {
    expect(validateRescueCaseInput({ shipmentId, objective: 'Protect the delivery commitment.' }).objective).toContain('Protect');
    expect(validateRescueActionInput({ actionType: 'reroute', title: 'Request alternate port option' }).actionType).toBe('reroute');
  });
  it('rejects unsafe evidence URLs and malformed IDs', () => {
    expect(() => validateRescueCaseInput({ shipmentId: 'nope', objective: 'x' })).toThrow(RescueValidationError);
    expect(() => validateRescueEvidenceInput({ evidenceType: 'source', title: 'Notice', sourceUrl: 'file:///private' })).toThrow(RescueValidationError);
  });
});
