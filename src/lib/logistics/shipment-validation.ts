import { SHIPMENT_STATUSES, type ShipmentInput, type ShipmentStatus } from './types';

const MAX_TEXT_LENGTH = 240;
const UUIDLESS_UTC = 'UTC';

export class ShipmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShipmentValidationError';
  }
}

function optionalText(value: unknown, field: string, maxLength = MAX_TEXT_LENGTH): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new ShipmentValidationError(`${field} must be text.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new ShipmentValidationError(`${field} must be ${maxLength} characters or fewer.`);
  return normalized || undefined;
}

function optionalTimestamp(value: unknown, field: string): string | undefined {
  const timestamp = optionalText(value, field, 64);
  if (!timestamp) return undefined;
  if (!Number.isFinite(Date.parse(timestamp))) throw new ShipmentValidationError(`${field} must be a valid timestamp.`);
  return timestamp;
}

export function validateShipmentInput(value: unknown): ShipmentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ShipmentValidationError('Shipment input must be an object.');
  }

  const input = value as Record<string, unknown>;
  const shipmentReference = optionalText(input.shipmentReference, 'Shipment reference', 160);
  if (!shipmentReference) throw new ShipmentValidationError('Shipment reference is required.');

  const imoNumber = optionalText(input.imoNumber, 'IMO number', 7);
  if (imoNumber && !/^\d{7}$/.test(imoNumber)) throw new ShipmentValidationError('IMO number must contain seven digits.');

  const priority = input.priority === undefined ? undefined : Number(input.priority);
  if (priority !== undefined && (!Number.isInteger(priority) || priority < 1 || priority > 5)) {
    throw new ShipmentValidationError('Priority must be an integer from 1 to 5.');
  }

  const currentStatus = optionalText(input.currentStatus, 'Current status', 32);
  if (currentStatus && !SHIPMENT_STATUSES.includes(currentStatus as ShipmentStatus)) {
    throw new ShipmentValidationError('Current status is invalid.');
  }

  return {
    shipmentReference,
    bookingNumber: optionalText(input.bookingNumber, 'Booking number'),
    containerNumber: optionalText(input.containerNumber, 'Container number'),
    billOfLadingReference: optionalText(input.billOfLadingReference, 'Bill of lading reference'),
    carrier: optionalText(input.carrier, 'Carrier'),
    vesselName: optionalText(input.vesselName, 'Vessel name'),
    imoNumber,
    originPortName: optionalText(input.originPortName, 'Origin port name'),
    originPortCode: optionalText(input.originPortCode, 'Origin port code', 16),
    destinationPortName: optionalText(input.destinationPortName, 'Destination port name'),
    destinationPortCode: optionalText(input.destinationPortCode, 'Destination port code', 16),
    operationalTimezone: optionalText(input.operationalTimezone, 'Operational timezone', 64) ?? UUIDLESS_UTC,
    plannedDepartureAt: optionalTimestamp(input.plannedDepartureAt, 'Planned departure'),
    plannedArrivalAt: optionalTimestamp(input.plannedArrivalAt, 'Planned arrival'),
    actualDepartureAt: optionalTimestamp(input.actualDepartureAt, 'Actual departure'),
    actualArrivalAt: optionalTimestamp(input.actualArrivalAt, 'Actual arrival'),
    cargoType: optionalText(input.cargoType, 'Cargo type'),
    priority,
    currentStatus: currentStatus as ShipmentStatus | undefined,
  };
}
