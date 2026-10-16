import { describe, expect, it } from 'vitest';
import { parseSelectedPort, validateRouteDraft } from './validation';

const origin = { id: 'port:ae-dxb', providerId: 'unlocode', label: 'Jebel Ali', latitude: 25.01, longitude: 55.06, countryCode: 'AE', unlocode: 'AEJEA' };
const destination = { id: 'port:in-nsa', providerId: 'unlocode', label: 'Nhava Sheva', latitude: 18.95, longitude: 72.95, countryCode: 'IN', unlocode: 'INNSA' };

describe('route draft validation', () => {
  it('accepts canonical shipment/vessel UUIDs while rejecting malformed identifiers', () => {
    const shipmentId = '11111111-1111-4111-8111-111111111111';
    const vesselEntityId = '22222222-2222-4222-9222-222222222222';
    expect(validateRouteDraft({ origin, destination, shipmentId, vesselEntityId })).toMatchObject({ shipmentId, vesselEntityId });
    expect(() => validateRouteDraft({ origin, destination, shipmentId: 'not-a-uuid' })).toThrow('Shipment ID is invalid');
  });
  it('requires explicit selected origin and destination candidates', () => {
    const route = validateRouteDraft({ origin, destination, plannedDepartureAt: '2026-08-08T00:00:00Z', plannedArrivalAt: '2026-08-12T00:00:00Z', imoNumber: '9074729', mmsiNumber: '123456789' });
    expect(route.waypoints).toEqual([
      expect.objectContaining({ waypointType: 'origin', sequenceNumber: 0, label: 'Jebel Ali' }),
      expect.objectContaining({ waypointType: 'destination', sequenceNumber: 1, label: 'Nhava Sheva' }),
    ]);
  });

  it('does not accept an unresolved text port as a selection', () => {
    expect(() => validateRouteDraft({ origin: 'Jebel Ali', destination })).toThrow('Origin must be an object.');
  });

  it('rejects duplicate endpoints and invalid itinerary data', () => {
    expect(() => validateRouteDraft({ origin, destination: origin })).toThrow('Origin and destination must be different');
    expect(() => validateRouteDraft({ origin, destination, plannedDepartureAt: '2026-08-12T00:00:00Z', plannedArrivalAt: '2026-08-08T00:00:00Z' })).toThrow('Planned arrival must not precede departure.');
    expect(() => parseSelectedPort({ ...origin, unlocode: 'BAD' }, 'Origin')).toThrow('UN/LOCODE');
    expect(() => validateRouteDraft({ origin, destination, via: Array.from({ length: 19 }, () => ({ ...origin, id: crypto.randomUUID() })) })).toThrow('at most 18 via ports');
  });
});
