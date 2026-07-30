export const PROVIDER_ENTITY_TYPES = [
  'location', 'coordinate', 'ip', 'domain', 'email', 'username', 'company',
  'organization', 'vessel', 'port', 'imo', 'mmsi', 'country', 'region', 'command',
] as const;
export type ProviderEntityType = (typeof PROVIDER_ENTITY_TYPES)[number];

export const SEARCH_INTENTS = [
  'forward_geocode', 'reverse_geocode', 'coordinate_lookup', 'ip_lookup', 'domain_lookup',
  'email_lookup', 'username_lookup', 'company_lookup', 'organization_lookup', 'vessel_lookup',
  'port_lookup', 'imo_lookup', 'mmsi_lookup', 'country_lookup', 'region_lookup', 'map_command',
  'dark_web_lookup', 'natural_language',
] as const;
export type SearchIntent = (typeof SEARCH_INTENTS)[number];

export type SearchCommand = 'show_submarine_cables' | 'show_ghost_ships' | 'show_sanctioned_vessels' | 'show_ai_data_centers' | 'unsupported_natural_language';

export type SearchAction =
  | { type: 'enable_layers'; layers: Array<'maritime' | 'cables' | 'war_sanctions'> }
  | { type: 'open_entity'; href: string }
  | { type: 'unavailable'; message: string };

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface ProviderMetadata {
  name: string;
  description: string;
  supportedEntityTypes: ProviderEntityType[];
  supportedIntents: SearchIntent[];
  supportsMapLayers: boolean;
  requiresCredentials: boolean;
  timeoutMs: number;
  enabled: boolean;
  priority: number;
}

export interface ProviderQuery {
  intent: SearchIntent;
  entityType: ProviderEntityType;
  query?: string;
  coordinates?: Coordinates;
  command?: SearchCommand;
  limit: number;
}

export interface NormalizedSearchResult {
  id: string;
  label: string;
  lat?: number;
  lng?: number;
  type: string;
  category: string;
  importance: number;
  zoomLevel: number;
  provider: string;
  summary?: string;
  action?: SearchAction;
  location?: {
    locality?: string;
    region?: string;
    country?: string;
  };
}

export interface ProviderExecutionContext {
  signal: AbortSignal;
  locale: string;
  origin?: string;
}

export type ProviderMapGeometry = 'point' | 'line' | 'polygon';

export interface ProviderMapFeature {
  type: 'Feature';
  geometry: {
    type: 'Point' | 'LineString' | 'MultiLineString' | 'Polygon' | 'MultiPolygon';
    coordinates: unknown;
  };
  properties?: Record<string, unknown>;
}

export interface ProviderMapLayer {
  id: string;
  provider: string;
  name: string;
  geometry: ProviderMapGeometry;
  source: { type: 'FeatureCollection'; features: ProviderMapFeature[] };
  style: {
    color: string;
    opacity?: number;
    radius?: number;
    width?: number;
    outlineColor?: string;
  };
  visible: boolean;
  interactive: boolean;
}

export interface ProviderMapLayerContext {
  signal: AbortSignal;
  origin?: string;
  requestedProviders?: string[];
}

export interface Provider {
  metadata: ProviderMetadata;
  isConfigured?(): boolean;
  execute(query: ProviderQuery, context: ProviderExecutionContext): Promise<unknown>;
  normalize(raw: unknown, query: ProviderQuery): NormalizedSearchResult[];
  createMapLayers(context: ProviderMapLayerContext): Promise<ProviderMapLayer[]>;
}

export interface ProviderDiagnostic {
  provider: string;
  status: 'success' | 'timeout' | 'error';
  resultCount: number;
}

export interface EnrichmentResponse {
  results: NormalizedSearchResult[];
  diagnostics: ProviderDiagnostic[];
}
