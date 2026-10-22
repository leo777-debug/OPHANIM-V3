import type { ShipmentRecord } from '@/lib/logistics/shipments';
import { exploreSeaRoute, findReferencePorts, MARITIME_NETWORK, PASSAGES, type Point } from './open-network';
import { pointToSeaRouteKm } from './scenario';
export type Scenario = { days: number } & ({ type: 'chokepoint_closed'; passage: string } | { type: 'port_closed'; port: string } | { type: 'sanctions_country'; country: string } | { type: 'severe_weather'; center: Point; radiusKm: number });
type Plan = Pick<ShipmentRecord, 'id' | 'shipmentReference' | 'originPortCode' | 'originPortName' | 'destinationPortCode' | 'destinationPortName' | 'transshipmentPorts'>;
export function parseScenario(value: unknown): Scenario {
  if (!value || typeof value !== 'object') throw new Error('Scenario required.'); const input = value as Record<string, unknown>, days = input.days;
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 1 || days > 365) throw new Error('Duration must be 1–365 days.');
  if (input.type === 'chokepoint_closed' && typeof input.passage === 'string' && PASSAGES[input.passage]) return { type: input.type, days, passage: input.passage };
  if (input.type === 'port_closed' && typeof input.port === 'string' && /^[A-Z]{2}[A-Z0-9]{3}$/i.test(input.port)) return { type: input.type, days, port: input.port.toUpperCase() };
  if (input.type === 'sanctions_country' && typeof input.country === 'string' && input.country.trim().length >= 2 && input.country.length <= 100) return { type: input.type, days, country: input.country.trim() };
  if (input.type === 'severe_weather' && Array.isArray(input.center) && input.center.length === 2 && input.center.every(Number.isFinite) && Math.abs(input.center[0]) <= 180 && Math.abs(input.center[1]) <= 90 && typeof input.radiusKm === 'number' && input.radiusKm >= 1 && input.radiusKm <= 1000) return { type: input.type, days, center: input.center as Point, radiusKm: input.radiusKm };
  throw new Error('Choose a valid scenario template and parameters.');
}
type Dependencies = { ports: typeof findReferencePorts; route: typeof exploreSeaRoute };
export async function assessShipmentScenario(shipments: Plan[], scenario: Scenario, dependencies: Dependencies = { ports: findReferencePorts, route: exploreSeaRoute }) {
  const reports = [], lookup = new Map<string, Awaited<ReturnType<typeof findReferencePorts>>>();
  const resolve = async (value: string) => { if (!lookup.has(value)) lookup.set(value, await dependencies.ports(value)); return lookup.get(value)!.find(port => port.code.toLowerCase() === value.toLowerCase() || port.name.toLowerCase() === value.toLowerCase()); };
  for (const shipment of shipments.slice(0, 200)) {
    const recorded = [shipment.originPortCode || shipment.originPortName, ...(shipment.transshipmentPorts ?? []), shipment.destinationPortCode || shipment.destinationPortName].filter((value): value is string => Boolean(value));
    if (!shipment.originPortCode && !shipment.originPortName || !shipment.destinationPortCode && !shipment.destinationPortName) { reports.push({ shipmentId: shipment.id, reference: shipment.shipmentReference, assessment: 'unknown', reason: 'Origin or destination is missing.' }); continue; }
    const ports = await Promise.all(recorded.map(resolve));
    if (ports.some(port => !port)) { reports.push({ shipmentId: shipment.id, reference: shipment.shipmentReference, assessment: 'unknown', reason: 'At least one recorded port could not be resolved exactly in the dated reference network.' }); continue; }
    const resolved = ports.filter((port): port is NonNullable<typeof port> => Boolean(port));
    let exposed = scenario.type === 'port_closed' ? resolved.some(port => port.code.toUpperCase() === scenario.port)
      : scenario.type === 'sanctions_country' ? resolved.some(port => port.country.toLowerCase() === scenario.country.toLowerCase()) : false;
    let seaKm = 0, rerouteExtraDays = 0, blocked = false, unresolved = false;
    for (let index = 1; index < resolved.length; index++) {
      const result = await dependencies.route(resolved[index - 1].coordinates, resolved[index].coordinates, { closed: scenario.type === 'chokepoint_closed' ? [scenario.passage] : [] });
      if (!result.baseline) { unresolved = true; break; } seaKm += result.baseline.distanceKm;
      if (scenario.type === 'chokepoint_closed' && result.baseline.passages.some(passage => passage.id === scenario.passage)) {
        exposed = true; if (!result.alternative) blocked = true; else rerouteExtraDays += Math.max(0, result.alternative.days - result.baseline.days);
      }
      if (scenario.type === 'severe_weather' && pointToSeaRouteKm(scenario.center, result.baseline.coordinates) <= scenario.radiusKm) exposed = true;
    }
    reports.push({ shipmentId: shipment.id, reference: shipment.shipmentReference, assessment: unresolved ? 'unknown' : exposed ? 'modeled exposure' : 'no modeled intersection',
      recordedPorts: recorded, resolvedCountries: [...new Set(resolved.map(port => port.country))], modeledSeaKm: seaKm,
      modeledExtraDays: unresolved || !exposed ? null : scenario.type === 'chokepoint_closed' ? blocked ? scenario.days : Math.min(scenario.days, rerouteExtraDays) : scenario.days,
      label: 'INFERENCE — network model; not the recorded vessel itinerary or a predicted delay' });
  }
  return { scenario, label: 'SCENARIO — model, not fact', dataset: MARITIME_NETWORK, totalRecords: shipments.length, assessedRecords: Math.min(shipments.length, 200), unassessedRecords: Math.max(0, shipments.length - 200), reports,
    calculation: 'FACT: organization shipment records supply port names/codes. INFERENCE: consecutive exact-resolved ports are linked by shortest reference sea paths at 14 knots. A chokepoint closure exposes paths containing that tag; a port closure matches recorded visits; country sanctions match reference port countries; weather intersects the hypothetical radius. Waiting adds N days. Chokepoint rerouting uses the smaller of N days and summed alternative-path extra days. No queue, capacity, vessel class, contracts, customs, schedule-window or road/rail effects are modeled.',
    limitation: 'Up to 200 records per calculation. Unknown/unresolved records are reported explicitly. Sanctions are hypothetical screening context, not a legal finding. No real event or closure is created.' };
}
