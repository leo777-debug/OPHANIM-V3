export const PROVIDER_ENTITY_TYPES = [
  'location', 'coordinate', 'ip', 'domain', 'email', 'username', 'company',
  'organization', 'person', 'vessel', 'port', 'imo', 'mmsi', 'country', 'region', 'command',
] as const;
export type ProviderEntityType = (typeof PROVIDER_ENTITY_TYPES)[number];

export type ProviderCategory = 'geospatial' | 'maritime' | 'aviation' | 'infrastructure' | 'sanctions' | 'network' | 'identity' | 'dark_web' | 'command' | 'other';

export interface ProviderCapabilities {
  search: boolean;
  fetch: boolean;
  map: boolean;
  stream: boolean;
  historical: boolean;
  monitoring: boolean;
}

export const SEARCH_INTENTS = [
  'forward_geocode', 'reverse_geocode', 'coordinate_lookup', 'ip_lookup', 'domain_lookup',
  'email_lookup', 'username_lookup', 'company_lookup', 'organization_lookup', 'person_lookup', 'vessel_lookup',
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
  /** Stable machine identifier. Existing providers fall back to their name during migration. */
  id?: string;
  name: string;
  description: string;
  category?: ProviderCategory;
  supportedEntityTypes: ProviderEntityType[];
  supportedIntents: SearchIntent[];
  supportedEventTypes?: string[];
  capabilities?: Partial<ProviderCapabilities>;
  supportsMapLayers: boolean;
  requiresCredentials: boolean;
  requiredEnvironmentVariables?: string[];
  timeoutMs: number;
  rateLimitPerMinute?: number;
  enabled: boolean;
  priority: number;
  geographicCoverage?: string;
  freshness?: string;
  license?: string;
  commercialUse?: 'allowed' | 'review_required' | 'restricted' | 'unknown';
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
  allowedProviderIds?: string[];
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
  supports?(query: ProviderQuery): boolean;
  execute?(query: ProviderQuery, context: ProviderExecutionContext): Promise<unknown>;
  search?(query: ProviderQuery, context: ProviderExecutionContext): Promise<unknown>;
  fetch?(query: ProviderQuery, context: ProviderExecutionContext): Promise<unknown>;
  normalize?(raw: unknown, query: ProviderQuery): NormalizedSearchResult[];
  createMapLayers?(context: ProviderMapLayerContext): Promise<ProviderMapLayer[]>;
  health?(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message?: string }>;
  validateConfiguration?(): { valid: boolean; message?: string };
}

export interface ProviderDiagnostic {
  provider: string;
  status: 'success' | 'timeout' | 'error' | 'circuit_open';
  resultCount: number;
}

export interface EnrichmentResponse {
  results: NormalizedSearchResult[];
  diagnostics: ProviderDiagnostic[];
}

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  search: true,
  fetch: true,
  map: false,
  stream: false,
  historical: false,
  monitoring: false,
};

export function providerId(metadata: Pick<ProviderMetadata, 'id' | 'name'>): string {
  return metadata.id ?? metadata.name;
}

export function providerCapabilities(metadata: ProviderMetadata): ProviderCapabilities {
  return {
    ...DEFAULT_CAPABILITIES,
    search: Boolean(metadata.capabilities?.search ?? (metadata.supportedIntents.length > 0)),
    fetch: Boolean(metadata.capabilities?.fetch ?? (metadata.supportedIntents.length > 0)),
    map: Boolean(metadata.capabilities?.map ?? metadata.supportsMapLayers),
    ...metadata.capabilities,
  };
}
