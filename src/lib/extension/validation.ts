export const extensionEntityTypes = [
  'shipment_reference',
  'container_number',
  'vessel_name',
  'imo_number',
  'mmsi_number',
  'port',
  'carrier',
  'company',
  'selection',
] as const;

export type ExtensionEntityType = (typeof extensionEntityTypes)[number];

export interface ExtensionEntity {
  type: ExtensionEntityType;
  value: string;
  confidence: number;
  source: 'generic' | 'gmail' | 'selection' | 'ophanim';
}

export interface ExtensionContextInput {
  page: {
    url: string;
    title: string;
    adapter: ExtensionEntity['source'];
  };
  entities: ExtensionEntity[];
}

export class ExtensionContextValidationError extends Error {}

const entityTypeSet = new Set<string>(extensionEntityTypes);
const sourceSet = new Set<ExtensionEntity['source']>(['generic', 'gmail', 'selection', 'ophanim']);

function safeText(value: unknown, maximum: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

export function validateExtensionContextInput(input: unknown): ExtensionContextInput {
  if (!input || typeof input !== 'object') throw new ExtensionContextValidationError('Extension context is required.');
  const candidate = input as { page?: unknown; entities?: unknown };
  const pageCandidate = candidate.page && typeof candidate.page === 'object'
    ? candidate.page as { url?: unknown; title?: unknown; adapter?: unknown }
    : {};
  const url = safeText(pageCandidate.url, 2048);
  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch { throw new ExtensionContextValidationError('A valid page URL is required.'); }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new ExtensionContextValidationError('Only web page URLs are accepted.');
  const adapter = sourceSet.has(pageCandidate.adapter as ExtensionEntity['source'])
    ? pageCandidate.adapter as ExtensionEntity['source']
    : 'generic';

  const rawEntities = Array.isArray(candidate.entities) ? candidate.entities.slice(0, 30) : [];
  const entities = rawEntities.flatMap((raw): ExtensionEntity[] => {
    if (!raw || typeof raw !== 'object') return [];
    const entity = raw as { type?: unknown; value?: unknown; confidence?: unknown; source?: unknown };
    if (!entityTypeSet.has(String(entity.type))) return [];
    const value = safeText(entity.value, 160);
    if (value.length < 2) return [];
    const numericConfidence = Number(entity.confidence);
    const confidence = Number.isFinite(numericConfidence) ? Math.min(100, Math.max(0, Math.round(numericConfidence))) : 70;
    const source = sourceSet.has(entity.source as ExtensionEntity['source']) ? entity.source as ExtensionEntity['source'] : adapter;
    return [{ type: entity.type as ExtensionEntityType, value, confidence, source }];
  });

  const unique = entities.filter((entity, index, all) => all.findIndex((item) => item.type === entity.type && item.value.toLocaleUpperCase() === entity.value.toLocaleUpperCase()) === index);
  return { page: { url: parsedUrl.toString(), title: safeText(pageCandidate.title, 300), adapter }, entities: unique };
}
