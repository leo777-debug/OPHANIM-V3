import { createHash, timingSafeEqual } from 'node:crypto';
import { sdkOrganizationId } from './configuration';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, limit: number, fallback = '') => typeof value === 'string' ? value.trim().slice(0, limit) : fallback;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function sdkKeyMatches(value: unknown, configured = process.env.SDK_INGEST_KEY): boolean {
  if (typeof value !== 'string' || !configured?.trim() || value.length > 4096) return false;
  return timingSafeEqual(createHash('sha256').update(value).digest(), createHash('sha256').update(configured).digest());
}
export function normalizeSdkEntity(value: unknown, source: string, now: number) {
  const input = object(value), position = object(input.position), id = text(typeof input.id === 'number' && Number.isSafeInteger(input.id) ? String(input.id) : input.id, 128);
  if (!id || !finite(position.lat) || !finite(position.lng) || Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) return null;
  const rawTimestamp = text(input.timestamp, 100), observed = Date.parse(rawTimestamp);
  const timestamp = Number.isFinite(observed) && observed <= now + 300000 ? new Date(observed).toISOString() : null;
  const display = object(input.display);
  return {
    id: `ext-${source}-${id}`, name: text(input.name, 200, `ENTITY-${id}`), domain: text(input.domain, 30, 'LAND'), entityType: text(input.entityType, 30, 'TRACK'),
    position: { lat: position.lat, lng: position.lng, ...(finite(position.alt) ? { alt: position.alt } : {}), ...(finite(position.heading) && position.heading >= 0 && position.heading <= 360 ? { heading: position.heading } : {}), ...(finite(position.speed) && position.speed >= 0 ? { speed: position.speed } : {}) },
    threat: text(input.threat, 30, 'NONE'), classification: text(input.classification, 40, 'UNCLASSIFIED'),
    source: { provider: source, feed: 'ingest-api', originalId: id, confidence: finite(input.confidence) && input.confidence >= 0 && input.confidence <= 1 ? input.confidence : null },
    timestamp, receivedAt: new Date(now).toISOString(), ...(rawTimestamp && !timestamp ? { reportedTimestamp: rawTimestamp, timeAnomaly: 'Invalid or future observation time; receipt time is separate.' } : {}),
    properties: object(input.properties),
    display: { color: /^#[\da-f]{6}$/i.test(String(display.color)) ? display.color as string : '#D4AF37', icon: text(display.icon, 60, 'dot-gold'), layerType: ['circle', 'symbol', 'line'].includes(String(display.layerType)) ? String(display.layerType) : 'circle', glow: display.glow === true, scale: finite(display.scale) ? Math.min(4, Math.max(0.25, display.scale)) : 1 },
  };
}
export type SdkEntity = NonNullable<ReturnType<typeof normalizeSdkEntity>>;
interface SdkState { organizationId: string | null; entities: Map<string, SdkEntity>; lastUpdate: number; revision: number; log: Array<{ source: string; count: number; timestamp: string }> }
const sdkGlobal = globalThis as typeof globalThis & { ophanimSdkState?: SdkState };
/** Single configured organization per worker. Configuration changes cannot expose an old tenant's state. */
export function sdkState() {
  const organizationId = sdkOrganizationId();
  if (!sdkGlobal.ophanimSdkState || sdkGlobal.ophanimSdkState.organizationId !== organizationId) sdkGlobal.ophanimSdkState = { organizationId, entities: new Map(), lastUpdate: 0, revision: 0, log: [] };
  return sdkGlobal.ophanimSdkState;
}
export function ingestSdkEntities(source: string, entities: unknown[], diagnostic = false, now = Date.now()) {
  const state = sdkState(); let accepted = 0, rejected = 0;
  for (const value of entities) {
    const entity = normalizeSdkEntity(value, source, now);
    if (!entity) { rejected++; continue; }
    accepted++;
    if (!diagnostic) {
      if (!state.entities.has(entity.id) && state.entities.size >= 10000) state.entities.delete(state.entities.keys().next().value!);
      state.entities.set(entity.id, entity);
    }
  }
  if (!diagnostic && accepted) { state.lastUpdate = now; state.revision++; state.log.push({ source, count: accepted, timestamp: new Date(now).toISOString() }); if (state.log.length > 100) state.log.splice(0, state.log.length - 100); }
  return { accepted, rejected, diagnostic, errors: rejected ? ['Some entities lack a valid ID or source coordinates.'] : [], timestamp: new Date(now).toISOString() };
}
