import { SHIPMENT_MILESTONE_TYPES, SHIPMENT_STATUSES, type ShipmentInput, type ShipmentMilestoneInput, type ShipmentMilestoneType, type ShipmentStatus } from './types';

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

function optionalIdentifier(value: unknown, field: string): string | undefined {
  const identifier = optionalText(value, field, 64);
  if (identifier && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier)) {
    throw new ShipmentValidationError(`${field} must be a UUID.`);
  }
  return identifier;
}

function optionalPorts(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;,]/) : undefined;
  if (!source) throw new ShipmentValidationError('Transshipment ports must be a list.');
  const ports = source.map((port) => optionalText(port, 'Transshipment port', 240)).filter((port): port is string => Boolean(port));
  if (ports.length > 20) throw new ShipmentValidationError('Transshipment ports must contain 20 ports or fewer.');
  return [...new Set(ports)];
}

function optionalMilestones(value: unknown): ShipmentMilestoneInput[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new ShipmentValidationError('Milestones must be a list.');
  const milestones = value.map((item): ShipmentMilestoneInput => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ShipmentValidationError('Each milestone must be an object.');
    const record = item as Record<string, unknown>;
    const milestoneType = optionalText(record.milestoneType, 'Milestone type', 64);
    if (!milestoneType || !SHIPMENT_MILESTONE_TYPES.includes(milestoneType as ShipmentMilestoneType)) throw new ShipmentValidationError('Milestone type is invalid.');
    const deadlineAt = optionalTimestamp(record.deadlineAt, 'Milestone deadline');
    if (!deadlineAt) throw new ShipmentValidationError('Milestone deadline is required.');
    return { milestoneType: milestoneType as ShipmentMilestoneType, deadlineAt };
  });
  if (milestones.length > SHIPMENT_MILESTONE_TYPES.length) throw new ShipmentValidationError('Too many milestones were supplied.');
  if (new Set(milestones.map((milestone) => milestone.milestoneType)).size !== milestones.length) throw new ShipmentValidationError('Each milestone type can be supplied once.');
  return milestones;
}

export function validateShipmentInput(value: unknown): ShipmentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ShipmentValidationError('Shipment input must be an object.');
  }

  const input = value as Record<string, unknown>;
  const shipmentReference = optionalText(input.shipmentReference, 'Shipment reference', 160);
  if (!shipmentReference) throw new ShipmentValidationError('Shipment reference is required.');

  const imoNumber = optionalText(input.imoNumber, 'IMO number', 16)?.replace(/\s/g, '');
  if (imoNumber && !/^\d{7}$/.test(imoNumber)) throw new ShipmentValidationError('IMO number must contain seven digits.');
  const mmsiNumber = optionalText(input.mmsiNumber, 'MMSI number', 16)?.replace(/\s/g, '');
  if (mmsiNumber && !/^\d{9}$/.test(mmsiNumber)) throw new ShipmentValidationError('MMSI number must contain nine digits.');

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
    carrier: optionalText(input.carrier, 'Carrier')?.replace(/\s+/g, ' '),
    vesselName: optionalText(input.vesselName, 'Vessel name')?.replace(/\s+/g, ' '),
    imoNumber,
    mmsiNumber,
    originPortName: optionalText(input.originPortName, 'Origin port name')?.replace(/\s+/g, ' '),
    originPortCode: optionalText(input.originPortCode, 'Origin port code', 16)?.toUpperCase(),
    destinationPortName: optionalText(input.destinationPortName, 'Destination port name')?.replace(/\s+/g, ' '),
    destinationPortCode: optionalText(input.destinationPortCode, 'Destination port code', 16)?.toUpperCase(),
    transshipmentPorts: optionalPorts(input.transshipmentPorts),
    customerId: optionalIdentifier(input.customerId, 'Customer ID'),
    customerContact: optionalText(input.customerContact, 'Customer contact'),
    ownerUserId: optionalIdentifier(input.ownerUserId, 'Owner user ID'),
    operationalTimezone: optionalText(input.operationalTimezone, 'Operational timezone', 64) ?? UUIDLESS_UTC,
    plannedDepartureAt: optionalTimestamp(input.plannedDepartureAt, 'Planned departure'),
    plannedArrivalAt: optionalTimestamp(input.plannedArrivalAt, 'Planned arrival'),
    actualDepartureAt: optionalTimestamp(input.actualDepartureAt, 'Actual departure'),
    actualArrivalAt: optionalTimestamp(input.actualArrivalAt, 'Actual arrival'),
    cargoType: optionalText(input.cargoType, 'Cargo type'),
    priority,
    currentStatus: currentStatus as ShipmentStatus | undefined,
    milestones: optionalMilestones(input.milestones),
  };
}
