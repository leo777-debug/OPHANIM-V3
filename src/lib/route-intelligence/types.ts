export const ROUTE_STATUSES = ['draft', 'ready', 'archived'] as const;
export const ROUTE_WAYPOINT_TYPES = ['origin', 'via', 'destination'] as const;

export type RouteStatus = (typeof ROUTE_STATUSES)[number];
export type RouteWaypointType = (typeof ROUTE_WAYPOINT_TYPES)[number];

export interface PortCandidate {
  id: string;
  providerId: string;
  label: string;
  latitude: number;
  longitude: number;
  country?: string;
  countryCode?: string;
  unlocode?: string;
  summary?: string;
}

export interface PortResolution {
  query: string;
  candidates: PortCandidate[];
  selectionRequired: boolean;
  coverage: 'available' | 'unavailable';
}

export type SelectedPort = PortCandidate;

export interface RouteDraftInput {
  routeName?: string;
  shipmentId?: string;
  vesselEntityId?: string;
  vesselName?: string;
  imoNumber?: string;
  mmsiNumber?: string;
  carrier?: string;
  cargoType?: string;
  plannedDepartureAt?: string;
  plannedArrivalAt?: string;
  actualDepartureAt?: string;
  actualArrivalAt?: string;
  origin: SelectedPort;
  destination: SelectedPort;
  via?: SelectedPort[];
}

export interface RouteWaypointInput extends SelectedPort {
  sequenceNumber: number;
  waypointType: RouteWaypointType;
}

export interface ValidatedRouteDraft extends Omit<RouteDraftInput, 'via'> {
  via: SelectedPort[];
  waypoints: RouteWaypointInput[];
}
