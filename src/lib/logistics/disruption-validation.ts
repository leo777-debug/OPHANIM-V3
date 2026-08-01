export const DISRUPTION_TYPES = ['port_closure', 'security', 'weather', 'cyber', 'infrastructure', 'labor', 'other'] as const;
export const DISRUPTION_STATUSES = ['monitoring', 'active', 'resolved'] as const;

export type DisruptionType = (typeof DISRUPTION_TYPES)[number];
export type DisruptionStatus = (typeof DISRUPTION_STATUSES)[number];

export interface DisruptionEvidenceInput {
  sourceName: string;
  title: string;
  sourceUrl: string;
  publishedAt?: string;
  excerpt?: string;
}

export interface DisruptionInput {
  source: string;
  sourceReference?: string;
  title: string;
  disruptionType: DisruptionType;
  severity: number;
  status?: DisruptionStatus;
  description?: string;
  effectiveAt?: string;
  reportedAt?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  affectedPorts?: string[];
  affectedVessels?: string[];
  sourceUrl?: string;
  evidence?: DisruptionEvidenceInput[];
}

export class DisruptionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DisruptionValidationError';
  }
}

function text(value: unknown, field: string, required = false, maxLength = 300): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new DisruptionValidationError(`${field} is required.`);
    return undefined;
  }
  if (typeof value !== 'string') throw new DisruptionValidationError(`${field} must be text.`);
  const normalized = value.trim();
  if (!normalized && required) throw new DisruptionValidationError(`${field} is required.`);
  if (normalized.length > maxLength) throw new DisruptionValidationError(`${field} must be ${maxLength} characters or fewer.`);
  return normalized || undefined;
}

function timestamp(value: unknown, field: string): string | undefined {
  const result = text(value, field, false, 64);
  if (result && !Number.isFinite(Date.parse(result))) throw new DisruptionValidationError(`${field} must be a valid timestamp.`);
  return result;
}

function url(value: unknown, field: string, required = false): string | undefined {
  const result = text(value, field, required, 2048);
  if (!result) return undefined;
  try {
    const parsed = new URL(result);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new DisruptionValidationError(`${field} must be an HTTP(S) URL.`);
  }
  return result;
}

function names(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 100) throw new DisruptionValidationError(`${field} must contain at most 100 values.`);
  return value.map((entry) => text(entry, field, true, 160)!).filter(Boolean);
}

function coordinate(value: unknown, field: string, minimum: number, maximum: number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new DisruptionValidationError(`${field} is invalid.`);
  return parsed;
}

export function validateDisruptionInput(value: unknown): DisruptionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DisruptionValidationError('Disruption input must be an object.');
  const input = value as Record<string, unknown>;
  const disruptionType = text(input.disruptionType, 'Disruption type', true, 32) as DisruptionType;
  if (!DISRUPTION_TYPES.includes(disruptionType)) throw new DisruptionValidationError('Disruption type is invalid.');
  const status = (text(input.status, 'Status', false, 32) ?? 'active') as DisruptionStatus;
  if (!DISRUPTION_STATUSES.includes(status)) throw new DisruptionValidationError('Status is invalid.');
  const severity = Number(input.severity);
  if (!Number.isInteger(severity) || severity < 1 || severity > 5) throw new DisruptionValidationError('Severity must be an integer from 1 to 5.');
  const latitude = coordinate(input.latitude, 'Latitude', -90, 90);
  const longitude = coordinate(input.longitude, 'Longitude', -180, 180);
  if ((latitude === undefined) !== (longitude === undefined)) throw new DisruptionValidationError('Latitude and longitude must be supplied together.');
  const radiusKm = coordinate(input.radiusKm, 'Radius', 0.01, 20_000);
  const evidenceValue = input.evidence;
  if (evidenceValue !== undefined && (!Array.isArray(evidenceValue) || evidenceValue.length > 20)) throw new DisruptionValidationError('Evidence must contain at most 20 records.');
  const evidence = (evidenceValue as unknown[] | undefined)?.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new DisruptionValidationError('Evidence record is invalid.');
    const row = item as Record<string, unknown>;
    return { sourceName: text(row.sourceName, 'Evidence source', true, 160)!, title: text(row.title, 'Evidence title', true)!, sourceUrl: url(row.sourceUrl, 'Evidence URL', true)!, publishedAt: timestamp(row.publishedAt, 'Evidence published time'), excerpt: text(row.excerpt, 'Evidence excerpt', false, 1_000) };
  });
  return {
    source: text(input.source, 'Source', true, 160)!, sourceReference: text(input.sourceReference, 'Source reference', false, 240),
    title: text(input.title, 'Title', true)!, disruptionType, severity, status, description: text(input.description, 'Description', false, 8_000),
    effectiveAt: timestamp(input.effectiveAt, 'Effective time'), reportedAt: timestamp(input.reportedAt, 'Reported time'), latitude, longitude, radiusKm,
    affectedPorts: names(input.affectedPorts, 'Affected ports'), affectedVessels: names(input.affectedVessels, 'Affected vessels'), sourceUrl: url(input.sourceUrl, 'Source URL'), evidence,
  };
}
