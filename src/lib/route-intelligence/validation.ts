import type { RouteWaypointInput, SelectedPort, ValidatedRouteDraft } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const PROVIDER_ID = /^[a-zA-Z0-9_-]{2,120}$/;
const UNLOCODE = /^[A-Z]{2}[A-Z0-9]{3}$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > maxLength) throw new Error(`${field} is invalid.`);
  return normalized;
}

function optionalId(value: unknown, field: string): string | undefined {
  const id = optionalText(value, field, 36);
  if (id && !UUID.test(id)) throw new Error(`${field} is invalid.`);
  return id;
}

function optionalTimestamp(value: unknown, field: string): string | undefined {
  const timestamp = optionalText(value, field, 64);
  if (timestamp && !Number.isFinite(Date.parse(timestamp))) throw new Error(`${field} is invalid.`);
  return timestamp;
}

function validImo(value: string): boolean {
  if (!/^\d{7}$/.test(value)) return false;
  const checksum = value.slice(0, 6).split('').reduce((total, digit, index) => total + Number(digit) * (7 - index), 0) % 10;
  return checksum === Number(value[6]);
}

export function parseSelectedPort(value: unknown, field: string): SelectedPort {
  const input = object(value, field);
  const id = optionalText(input.id, `${field} ID`, 500);
  const providerId = optionalText(input.providerId, `${field} provider`, 120);
  const label = optionalText(input.label, `${field} label`, 500);
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!id || !providerId || !PROVIDER_ID.test(providerId) || !label) throw new Error(`${field} must be a selected provider candidate.`);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error(`${field} coordinates are invalid.`);
  const country = optionalText(input.country, `${field} country`, 160);
  const countryCode = optionalText(input.countryCode, `${field} country code`, 2)?.toUpperCase();
  const unlocode = optionalText(input.unlocode, `${field} UN/LOCODE`, 5)?.toUpperCase();
  if (countryCode && !COUNTRY_CODE.test(countryCode)) throw new Error(`${field} country code is invalid.`);
  if (unlocode && !UNLOCODE.test(unlocode)) throw new Error(`${field} UN/LOCODE is invalid.`);
  return { id, providerId, label, latitude, longitude, country, countryCode, unlocode, summary: optionalText(input.summary, `${field} summary`, 1_000) };
}

function ensureChronology(departure: string | undefined, arrival: string | undefined, label: string): void {
  if (departure && arrival && Date.parse(arrival) < Date.parse(departure)) throw new Error(`${label} arrival must not precede departure.`);
}

export function validateRouteDraft(value: unknown): ValidatedRouteDraft {
  const input = object(value, 'Route');
  const origin = parseSelectedPort(input.origin, 'Origin');
  const destination = parseSelectedPort(input.destination, 'Destination');
  const via = input.via === undefined ? [] : Array.isArray(input.via)
    ? (() => {
      if (input.via.length > 18) throw new Error('A route can contain at most 18 via ports.');
      return input.via.map((port, index) => parseSelectedPort(port, `Via port ${index + 1}`));
    })()
    : (() => { throw new Error('Via ports must be an array.'); })();
  if (origin.providerId === destination.providerId && origin.id === destination.id) throw new Error('Origin and destination must be different selected ports.');

  const plannedDepartureAt = optionalTimestamp(input.plannedDepartureAt, 'Planned departure');
  const plannedArrivalAt = optionalTimestamp(input.plannedArrivalAt, 'Planned arrival');
  const actualDepartureAt = optionalTimestamp(input.actualDepartureAt, 'Actual departure');
  const actualArrivalAt = optionalTimestamp(input.actualArrivalAt, 'Actual arrival');
  ensureChronology(plannedDepartureAt, plannedArrivalAt, 'Planned');
  ensureChronology(actualDepartureAt, actualArrivalAt, 'Actual');

  const imoNumber = optionalText(input.imoNumber, 'IMO number', 7);
  const mmsiNumber = optionalText(input.mmsiNumber, 'MMSI number', 9);
  if (imoNumber && !validImo(imoNumber)) throw new Error('IMO number is invalid.');
  if (mmsiNumber && !/^\d{9}$/.test(mmsiNumber)) throw new Error('MMSI number is invalid.');

  const waypoints: RouteWaypointInput[] = [
    { ...origin, sequenceNumber: 0, waypointType: 'origin' },
    ...via.map((port, index) => ({ ...port, sequenceNumber: index + 1, waypointType: 'via' as const })),
    { ...destination, sequenceNumber: via.length + 1, waypointType: 'destination' },
  ];

  return {
    routeName: optionalText(input.routeName, 'Route name', 240),
    shipmentId: optionalId(input.shipmentId, 'Shipment ID'),
    vesselEntityId: optionalId(input.vesselEntityId, 'Vessel entity ID'),
    vesselName: optionalText(input.vesselName, 'Vessel name', 240),
    imoNumber,
    mmsiNumber,
    carrier: optionalText(input.carrier, 'Carrier', 240),
    cargoType: optionalText(input.cargoType, 'Cargo type', 240),
    plannedDepartureAt,
    plannedArrivalAt,
    actualDepartureAt,
    actualArrivalAt,
    origin,
    destination,
    via,
    waypoints,
  };
}
