import { describe, expect, it } from 'vitest';
import { matchShipmentToDisruption, type DisruptionRecord } from './disruptions';
import type { ShipmentRecord } from './shipments';

const shipment: ShipmentRecord = { id: 'shipment-1', organizationId: 'org-1', shipmentReference: 'OPH-2941', imoNumber: '9728941', vesselName: 'MSC IRINA', originPortCode: 'CNSHA', destinationPortCode: 'NLRTM', operationalTimezone: 'UTC', priority: 3, currentStatus: 'in_transit', createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z', plannedDepartureAt: '2026-07-10T08:00:00Z' };
const disruption: DisruptionRecord = { id: 'disruption-1', organizationId: 'org-1', source: 'Port authority', title: 'Rotterdam closure', disruptionType: 'port_closure', severity: 4, status: 'active', effectiveAt: '2026-07-12T00:00:00Z', affectedPorts: ['NLRTM'], affectedVessels: [], evidence: [], createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' };

describe('deterministic disruption matching', () => {
  it('matches a port code and records the last known pre-disruption move', () => {
    const result = matchShipmentToDisruption(shipment, disruption);
    expect(result).toMatchObject({ impactStatus: 'affected', impactScore: 70, lastSafeMoveAt: shipment.plannedDepartureAt });
    expect(result?.matchedSignals).toEqual([{ kind: 'port_code', value: 'NLRTM', score: 70 }]);
  });

  it('does not infer a match when identifiers and route data do not overlap', () => {
    expect(matchShipmentToDisruption(shipment, { ...disruption, affectedPorts: ['USLAX'] })).toBeNull();
  });
});
