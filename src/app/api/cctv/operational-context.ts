import type {
  CctvCamera,
  OperationalCameraCategory,
  OperationalCameraScope,
} from './types';

export type CameraFocus = 'all' | 'logistics' | 'transport';

interface OperationalHub {
  category: Exclude<OperationalCameraCategory, 'general_traffic'>;
  lat: number;
  lng: number;
  radiusKm: number;
}

// These are broad public-transport context areas, not facility perimeters. They
// help operators find public camera coverage around major logistics routes.
const OPERATIONAL_HUBS: OperationalHub[] = [
  { category: 'port_approach', lat: 33.74, lng: -118.24, radiusKm: 30 }, // Los Angeles / Long Beach
  { category: 'port_approach', lat: 47.25, lng: -122.43, radiusKm: 35 }, // Seattle / Tacoma
  { category: 'port_approach', lat: 49.29, lng: -123.12, radiusKm: 30 }, // Vancouver
  { category: 'port_approach', lat: 40.68, lng: -74.05, radiusKm: 35 }, // New York / New Jersey
  { category: 'port_approach', lat: 25.78, lng: -80.18, radiusKm: 30 }, // Miami
  { category: 'port_approach', lat: 22.29, lng: 114.16, radiusKm: 25 }, // Hong Kong
  { category: 'port_approach', lat: 1.27, lng: 103.84, radiusKm: 30 }, // Singapore
  { category: 'port_approach', lat: 54.37, lng: 18.67, radiusKm: 30 }, // Gdansk / Gdynia
  { category: 'airport_access', lat: 33.94, lng: -118.41, radiusKm: 15 }, // LAX
  { category: 'airport_access', lat: 47.45, lng: -122.31, radiusKm: 15 }, // SeaTac
  { category: 'airport_access', lat: 49.19, lng: -123.18, radiusKm: 15 }, // YVR
  { category: 'airport_access', lat: 22.31, lng: 113.92, radiusKm: 15 }, // Hong Kong International
  { category: 'border_crossing', lat: 32.54, lng: -117.03, radiusKm: 20 }, // San Ysidro / Otay Mesa
  { category: 'border_crossing', lat: 49.0, lng: -122.76, radiusKm: 25 }, // Blaine / Surrey
  { category: 'canal_lock', lat: 9.1, lng: -79.7, radiusKm: 30 }, // Panama Canal
];

const OFFICIAL_PUBLIC_SOURCE_PATTERN = /(?:\b(?:511|dot|transport|traffic|road|highway|caltrans|wsdot|asfinag|tfl|lta|ndw|udot|drivebc)\b|^city of\b|^ville\b|travel midwest)/i;
const PORT_PATTERN = /\b(?:port|harbo(?:u)?r|terminal|dock|quay|wharf|pier|marina|ferry)\b/i;
const AIRPORT_PATTERN = /\b(?:airport|air cargo|cargo terminal)\b/i;
const BORDER_PATTERN = /\b(?:border|customs|crossing)\b/i;
const CANAL_PATTERN = /\b(?:canal|lock)\b/i;
const FREIGHT_PATTERN = /\b(?:freight|truck|cargo|rail|intermodal|logistics)\b/i;

function distanceKm(a: Pick<CctvCamera, 'lat' | 'lng'>, b: Pick<OperationalHub, 'lat' | 'lng'>): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function closestHubCategory(camera: CctvCamera): OperationalCameraCategory | null {
  const hub = OPERATIONAL_HUBS
    .map((candidate) => ({ candidate, distance: distanceKm(camera, candidate) }))
    .filter(({ candidate, distance }) => distance <= candidate.radiusKm)
    .sort((a, b) => a.distance - b.distance)[0]?.candidate;
  return hub?.category ?? null;
}

function contextFor(category: OperationalCameraCategory, isOfficial: boolean): string {
  if (!isOfficial) return 'Public camera feed with no Ophanim operational classification.';
  switch (category) {
    case 'port_approach': return 'Official public camera near a port approach or maritime logistics hub.';
    case 'airport_access': return 'Official public camera near an airport cargo-access corridor.';
    case 'border_crossing': return 'Official public camera near a border-crossing transport corridor.';
    case 'freight_corridor': return 'Official public camera on a freight, rail, or cargo-access corridor.';
    case 'canal_lock': return 'Official public camera near a canal or lock transport corridor.';
    default: return 'Official public traffic camera; useful for broad transport context.';
  }
}

export function isOfficialPublicCameraSource(source: string): boolean {
  return OFFICIAL_PUBLIC_SOURCE_PATTERN.test(source);
}

export function classifyOperationalCamera(camera: CctvCamera): CctvCamera {
  const officialPublicSource = isOfficialPublicCameraSource(camera.source);
  const label = `${camera.name} ${camera.city}`;
  let category: OperationalCameraCategory = 'general_traffic';

  if (officialPublicSource) {
    category = PORT_PATTERN.test(label) ? 'port_approach'
      : AIRPORT_PATTERN.test(label) ? 'airport_access'
        : BORDER_PATTERN.test(label) ? 'border_crossing'
          : CANAL_PATTERN.test(label) ? 'canal_lock'
            : FREIGHT_PATTERN.test(label) ? 'freight_corridor'
              : closestHubCategory(camera) ?? 'general_traffic';
  }

  const scope: OperationalCameraScope = !officialPublicSource
    ? 'general'
    : category === 'general_traffic' ? 'transport' : 'logistics';

  return {
    ...camera,
    official_public_source: officialPublicSource,
    operational_category: category,
    operational_scope: scope,
    operational_context: contextFor(category, officialPublicSource),
  };
}

export function filterCamerasByFocus(cameras: CctvCamera[], focus: CameraFocus): CctvCamera[] {
  if (focus === 'logistics') return cameras.filter((camera) => camera.operational_scope === 'logistics');
  if (focus === 'transport') return cameras.filter((camera) => camera.official_public_source);
  return cameras;
}
