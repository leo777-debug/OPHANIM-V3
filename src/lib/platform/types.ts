export type JsonObject = Record<string, unknown>;
export type EntityVisibility = 'global' | 'organization_private';

export interface EntityIdentifierInput {
  namespace: string;
  value: string;
  sourceId?: string;
  confidence?: number;
  metadata?: JsonObject;
}

export interface EntityInput {
  entityType: string;
  canonicalName: string;
  aliases?: string[];
  identifiers?: EntityIdentifierInput[];
  attributes?: JsonObject;
  metadata?: JsonObject;
  confidence?: number;
}

export interface PlatformEntity {
  id: string;
  organizationId: string | null;
  visibility: EntityVisibility;
  entityType: string;
  canonicalName: string;
  normalizedKey: string;
  attributes: JsonObject;
  metadata: JsonObject;
  confidence: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  identifiers?: EntityIdentifierInput[];
  aliases?: string[];
}

export interface EventInput {
  eventType: string;
  category?: string;
  title: string;
  description?: string;
  status?: 'active' | 'monitoring' | 'resolved' | 'cancelled' | 'unknown';
  occurredAt?: string;
  latitude?: number;
  longitude?: number;
  geometry?: JsonObject;
  severity?: number;
  confidence?: number;
  attributes?: JsonObject;
  metadata?: JsonObject;
  relatedEntityIds?: string[];
}

export interface PlatformEvent {
  id: string;
  organizationId: string | null;
  visibility: EntityVisibility;
  eventType: string;
  category: string;
  title: string;
  description: string | null;
  status: string;
  occurredAt: string | null;
  firstSeenAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  geometry: JsonObject | null;
  severity: number | null;
  confidence: number | null;
  attributes: JsonObject;
  metadata: JsonObject;
}

export interface EvidenceInput {
  evidenceType: string;
  verificationState?: 'source_record' | 'externally_reported' | 'user_submitted' | 'calculated' | 'ai_generated' | 'analyst_verified' | 'disputed';
  title: string;
  description?: string;
  sourceId?: string;
  providerId?: string;
  sourceUrl?: string;
  attachmentUrl?: string;
  originalTimestamp?: string;
  metadata?: JsonObject;
  links?: Array<{ resourceType: 'entity' | 'event' | 'case' | 'task' | 'assessment'; resourceId: string }>;
}

export interface CaseInput {
  title: string;
  description?: string;
  workflowTemplateId?: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  deadlineAt?: string;
  entityIds?: string[];
  eventIds?: string[];
}

export interface CaseTaskInput {
  title: string;
  description?: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  dueAt?: string;
  assigneeUserId?: string;
}

export interface OrganizationConfiguration {
  vertical: string;
  capabilities: Record<string, boolean>;
  enabledProviderIds: string[];
  navigation: Array<{ id: string; label: string; href: string; capability?: string }>;
  terminology: Record<string, string>;
  dashboard: JsonObject;
  analyticsEnabled: boolean;
  demoModeEnabled: boolean;
}
