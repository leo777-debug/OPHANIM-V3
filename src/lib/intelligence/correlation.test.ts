import { describe, expect, it } from 'vitest';
import { correlateShipment } from './correlation';

describe('operational correlation', () => {
  it('requires a deterministic shipment identifier or route signal', () => {
    const match = correlateShipment('AIS report identifies IMO 1234567 near NLRTM', {
      id: 'shipment-1', organizationId: 'org-1', shipmentReference: 'REF-001', imoNumber: '1234567', transshipmentPorts: [], operationalTimezone: 'UTC', priority: 3, currentStatus: 'in_transit', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', originPortCode: 'NLRTM',
    });
    expect(match?.signals.map((item) => item.kind)).toEqual(expect.arrayContaining(['imo', 'origin_port']));
    expect(correlateShipment('unrelated text', { id: 'shipment-1', organizationId: 'org-1', shipmentReference: 'REF-001', transshipmentPorts: [], operationalTimezone: 'UTC', priority: 3, currentStatus: 'in_transit', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })).toBeNull();
  });
});
