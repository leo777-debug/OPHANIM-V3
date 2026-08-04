export const DARK_WEB_SOURCE_CATEGORIES = ['licensed_intelligence', 'public_onion_index', 'ransomware_leak_feed', 'paste_feed', 'telegram_intelligence', 'defensive_threat_feed', 'development_fixture'] as const;
export const DARK_WEB_ENTITY_TYPES = ['vessel', 'port', 'terminal', 'subsea_cable', 'landing_station', 'company', 'carrier', 'client', 'asset', 'domain', 'ip', 'vendor', 'product', 'threat_actor'] as const;
export type DarkWebSourceCategory = (typeof DARK_WEB_SOURCE_CATEGORIES)[number];
export type DarkWebEntityType = (typeof DARK_WEB_ENTITY_TYPES)[number];
export type MentionReviewStatus = 'new' | 'needs_triage' | 'under_review' | 'likely_relevant' | 'false_positive' | 'duplicate' | 'escalated' | 'monitoring' | 'closed';
export type SourceChainLabel = 'likely_original' | 'likely_copy' | 'possible_copy' | 'independent_source' | 'relationship_unknown';

export interface DarkWebProviderMetadata {
  id: string;
  name: string;
  description: string;
  sourceCategories: DarkWebSourceCategory[];
  supportedEntityTypes: DarkWebEntityType[];
  authenticationRequirements: string[];
  environmentVariables: string[];
  rateLimitPerMinute: number;
  timeoutMs: number;
  enabled: boolean;
  commercialUse: 'allowed' | 'restricted' | 'review_required';
  retentionHours: number;
  supportsHistoricalSearch: boolean;
  supportsContinuousMonitoring: boolean;
  supportsOriginalTimestamps: boolean;
  supportsSourceReferences: boolean;
  attachmentBehavior: 'none' | 'metadata_only' | 'manual_review_only';
}

export interface DarkWebSearchQuery { query: string; entityTypes: DarkWebEntityType[]; limit: number; historical?: boolean; }
export interface DarkWebProviderContext { signal: AbortSignal; organizationId: string; }
export interface DarkWebRawMention {
  providerDocumentId: string;
  sourceCategory: DarkWebSourceCategory;
  sourceName: string;
  sourceReference?: string;
  publishedAt?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  originalLanguage?: string;
  originalText: string;
  translatedText?: string;
  title?: string;
  sourceReliability: number;
  matchedIdentifiers?: string[];
  threatCategories: string[];
}
export interface DarkWebProvider {
  metadata: DarkWebProviderMetadata;
  supports(query: DarkWebSearchQuery): boolean;
  search(query: DarkWebSearchQuery, context: DarkWebProviderContext): Promise<DarkWebRawMention[]>;
  normalize(raw: DarkWebRawMention): DarkWebRawMention;
  health(context: DarkWebProviderContext): Promise<{ status: 'healthy' | 'unavailable' | 'misconfigured'; detail?: string }>;
  validateConfiguration(): { valid: boolean; errors: string[] };
  redact(raw: DarkWebRawMention): DarkWebRawMention;
}

export interface RegisteredEntity { id: string; entityType: DarkWebEntityType | 'organization' | 'shipment' | 'location' | 'country' | 'region' | 'vendor_dependency' | 'vulnerability'; canonicalName: string; normalizedKey: string; aliases: Array<{ alias: string; identifierType?: string; identifierValue?: string }>; attributes: Record<string, unknown>; lastVerifiedAt?: string; }
export interface NormalizedMention extends DarkWebRawMention { id?: string; providerId: string; contentHash: string; sourceReference?: string; reviewStatus: MentionReviewStatus; sourceChainLabel: SourceChainLabel; independentSourceCount: number; }
export interface EntityMatch { entityId: string; matchMethod: 'exact_imo' | 'exact_mmsi' | 'exact_callsign' | 'exact_unlocode' | 'exact_domain' | 'exact_ip' | 'exact_client_identifier' | 'exact_vendor_product' | 'vessel_alias_owner' | 'port_terminal' | 'company_domain' | 'product_dependency' | 'name_context' | 'weak_name'; matchedText: string; identifier?: string; confidenceContribution: number; ambiguous: boolean; requiresReview: boolean; evidence: Record<string, unknown>; }
