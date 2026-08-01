import { describe, expect, it } from 'vitest';
import { ShipmentValidationError, validateShipmentInput } from './shipment-validation';

describe('shipment validation', () => {
  it('accepts a minimally complete shipment', () => {
    expect(validateShipmentInput({ shipmentReference: 'OPH-2941' })).toMatchObject({
      shipmentReference: 'OPH-2941',
      operationalTimezone: 'UTC',
    });
  });

  it('rejects invalid IMO values', () => {
    expect(() => validateShipmentInput({ shipmentReference: 'OPH-2941', imoNumber: '123' })).toThrow(ShipmentValidationError);
  });

  it('rejects a fabricated deadline timestamp', () => {
    expect(() => validateShipmentInput({ shipmentReference: 'OPH-2941', plannedArrivalAt: 'not-a-date' })).toThrow(ShipmentValidationError);
  });

  it('rejects invalid priority values', () => {
    expect(() => validateShipmentInput({ shipmentReference: 'OPH-2941', priority: 6 })).toThrow(ShipmentValidationError);
  });
});
