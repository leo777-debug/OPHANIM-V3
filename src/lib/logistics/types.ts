export const SHIPMENT_STATUSES = ['planned', 'booked', 'in_transit', 'at_port', 'delivered', 'cancelled', 'archived'] as const;
export const SHIPMENT_MILESTONE_TYPES = [
  'documentation_cutoff',
  'cargo_cutoff',
  'gate_in_cutoff',
  'vessel_departure',
  'customs_filing_deadline',
  'transshipment_connection',
  'carrier_amendment_deadline',
  'warehouse_receiving_slot',
  'truck_appointment',
  'last_free_day',
  'equipment_return_deadline',
  'customer_delivery_commitment',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
export type ShipmentMilestoneType = (typeof SHIPMENT_MILESTONE_TYPES)[number];

export interface ShipmentMilestoneInput {
  milestoneType: ShipmentMilestoneType;
  deadlineAt: string;
}

export interface ShipmentInput {
  shipmentReference: string;
  bookingNumber?: string;
  containerNumber?: string;
  billOfLadingReference?: string;
  carrier?: string;
  vesselName?: string;
  imoNumber?: string;
  mmsiNumber?: string;
  originPortName?: string;
  originPortCode?: string;
  destinationPortName?: string;
  destinationPortCode?: string;
  transshipmentPorts?: string[];
  customerId?: string;
  customerContact?: string;
  ownerUserId?: string;
  operationalTimezone?: string;
  plannedDepartureAt?: string;
  plannedArrivalAt?: string;
  actualDepartureAt?: string;
  actualArrivalAt?: string;
  cargoType?: string;
  priority?: number;
  currentStatus?: ShipmentStatus;
  milestones?: ShipmentMilestoneInput[];
}
