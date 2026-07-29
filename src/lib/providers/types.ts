export const PROVIDER_ENTITY_TYPES = ['location', 'coordinate'] as const;
export type ProviderEntityType = (typeof PROVIDER_ENTITY_TYPES)[number];

export const SEARCH_INTENTS = ['forward_geocode', 'reverse_geocode', 'coordinate_lookup'] as const;
export type SearchIntent = (typeof SEARCH_INTENTS)[number];

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
}

export interface ProviderQuery {
  intent: SearchIntent;
  entityType: ProviderEntityType;
  query?: string;
  coordinates?: Coordinates;
  limit: number;
}

export interface NormalizedSearchResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
  type: string;
  category: string;
  importance: number;
  zoomLevel: number;
  provider: string;
  location?: {
    locality?: string;
    region?: string;
    country?: string;
  };
}

export interface ProviderExecutionContext {
  signal: AbortSignal;
  locale: string;
}

export interface Provider {
  metadata: ProviderMetadata;
  isConfigured?(): boolean;
  execute(query: ProviderQuery, context: ProviderExecutionContext): Promise<unknown>;
  normalize(raw: unknown, query: ProviderQuery): NormalizedSearchResult[];
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
