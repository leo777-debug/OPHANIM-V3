import { describe, expect, it } from 'vitest';
import { assessShipmentScenario, parseScenario } from './scenarios';
const shipment = { id: 'test', shipmentReference: 'TEST-ONLY', originPortCode: 'AEJEA', destinationPortCode: 'NLRTM', transshipmentPorts: [] };
describe('scenario templates with real reference network', () => {
  it('exposes modeled Suez transits and keeps unresolved records unknown', async () => {
    const result = await assessShipmentScenario([shipment, { ...shipment, id: 'unknown', originPortCode: 'XXXXX' }], parseScenario({ type: 'chokepoint_closed', days: 7, passage: 'suez' }));
    expect(result.reports[0].assessment).toBe('modeled exposure'); expect(result.reports[1].assessment).toBe('unknown');
  });
  it('matches port visits and country reference names without inventing sanctions facts', async () => {
    expect((await assessShipmentScenario([shipment], parseScenario({ type: 'port_closed', days: 3, port: 'AEJEA' }))).reports[0].assessment).toBe('modeled exposure');
    const result = await assessShipmentScenario([shipment], parseScenario({ type: 'sanctions_country', days: 10, country: 'United Arab Emirates' }));
    expect(result.reports[0].assessment).toBe('modeled exposure'); expect(result.limitation).toContain('not a legal finding');
  });
  it('validates hypothetical weather footprints and never accepts negative durations', () => {
    expect(parseScenario({ type: 'severe_weather', days: 2, center: [56, 25], radiusKm: 100 }).type).toBe('severe_weather');
    expect(() => parseScenario({ type: 'severe_weather', days: 2, center: [200, 25], radiusKm: 100 })).toThrow();
    expect(() => parseScenario({ type: 'port_closed', days: -1, port: 'AEJEA' })).toThrow();
  });
});
