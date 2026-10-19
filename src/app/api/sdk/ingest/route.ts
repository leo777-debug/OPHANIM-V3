import { NextRequest, NextResponse } from 'next/server';
import { authorizeSdkRead, sdkOrganizationId } from '@/lib/integrations/sdk-access';
import { isRateLimited } from '@/lib/ssrf-guard';

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  POLYBOLOS SDK — Ingestion Endpoint                             ║
 * ║  Secure webhook for external platform data push                 ║
 * ║                                                                 ║
 * ║  POST /api/sdk/ingest → Accepts Polybolos-format entities       ║
 * ║  from external systems (e.g., Anduril Lattice) and merges       ║
 * ║  them into the Common Operating Picture.                        ║
 * ║                                                                 ║
 * ║  GET  /api/sdk/ingest → Returns current SDK entity count        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// Share the entity store with the stream endpoint
const globalForSDK = globalThis as unknown as {
  sdkEntityStore: Map<string, unknown>;
  sdkLastUpdate: number;
  sdkIngestLog: Array<{ source: string; count: number; timestamp: string }>;
};

if (!globalForSDK.sdkEntityStore) {
  globalForSDK.sdkEntityStore = new Map();
  globalForSDK.sdkLastUpdate = 0;
}
if (!globalForSDK.sdkIngestLog) {
  globalForSDK.sdkIngestLog = [];
}

// Fail-closed: require SDK_INGEST_KEY env var, disable endpoint when unset
const SDK_KEY = process.env.SDK_INGEST_KEY;
const VALID_KEYS = SDK_KEY ? new Set([SDK_KEY]) : null;

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 1000000) return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
    const body = await request.json();

    // Validate structure
    if (!body.source || !body.apiKey || !Array.isArray(body.entities)) {
      return NextResponse.json({
        accepted: 0,
        rejected: 0,
        errors: ['Invalid payload structure. Required: { source, apiKey, entities[] }'],
        timestamp: new Date().toISOString(),
      }, { status: 400 });
    }

    // Validate API key (fail-closed: endpoint disabled when SDK_INGEST_KEY is unset)
    if (!VALID_KEYS || !sdkOrganizationId()) {
      return NextResponse.json({
        accepted: 0,
        rejected: 0,
        errors: ['Ingest endpoint disabled — configure SDK_INGEST_KEY and SDK_ORGANIZATION_ID in Admin → Integrations'],
        timestamp: new Date().toISOString(),
      }, { status: 503 });
    }
    if (!VALID_KEYS.has(body.apiKey)) {
      return NextResponse.json({
        accepted: 0,
        rejected: 0,
        errors: ['Invalid API key'],
        timestamp: new Date().toISOString(),
      }, { status: 401 });
    }

    if (isRateLimited(`sdk-ingest:${sdkOrganizationId()}`, 30)) return NextResponse.json({ error: 'Rate limit reached.' }, { status: 429 });
    if (typeof body.source !== 'string' || !/^[a-z0-9_.-]{1,80}$/i.test(body.source) || body.entities.length > 500) return NextResponse.json({ error: 'Provide a source identifier and at most 500 entities.' }, { status: 400 });

    let accepted = 0;
    let rejected = 0;
    const errors: string[] = [];

    for (const entity of body.entities) {
      // Validate minimum required fields
      if (!entity.id || !Number.isFinite(entity.position?.lat) || !Number.isFinite(entity.position?.lng) || Math.abs(entity.position.lat) > 90 || Math.abs(entity.position.lng) > 180) {
        rejected++;
        errors.push(`Entity missing required fields (id, position.lat, position.lng): ${entity.id || 'unknown'}`);
        continue;
      }

      // Normalize and store
      const normalized = {
        id: `ext-${body.source}-${entity.id}`,
        name: entity.name || `ENTITY-${entity.id}`,
        domain: entity.domain || 'LAND',
        entityType: entity.entityType || 'TRACK',
        position: {
          lat: entity.position.lat,
          lng: entity.position.lng,
          alt: entity.position.alt,
          heading: entity.position.heading,
          speed: entity.position.speed,
        },
        threat: entity.threat || 'NONE',
        classification: entity.classification || 'UNCLASSIFIED',
        source: {
          provider: body.source,
          feed: 'ingest-api',
          originalId: entity.id,
          confidence: entity.confidence || 0.8,
        },
        timestamp: typeof entity.timestamp === 'string' && Number.isFinite(Date.parse(entity.timestamp)) ? new Date(entity.timestamp).toISOString() : null,
        receivedAt: new Date().toISOString(),
        properties: entity.properties || {},
        display: entity.display || {
          color: '#D4AF37',
          icon: 'dot-gold',
          layerType: 'circle',
          glow: false,
          scale: 1.0,
        },
      };

      if (!globalForSDK.sdkEntityStore.has(normalized.id) && globalForSDK.sdkEntityStore.size >= 10000) globalForSDK.sdkEntityStore.delete(globalForSDK.sdkEntityStore.keys().next().value!);
      globalForSDK.sdkEntityStore.set(normalized.id, normalized);
      accepted++;
    }

    // Update timestamp to trigger SSE push
    globalForSDK.sdkLastUpdate = Date.now();

    // Log ingestion
    globalForSDK.sdkIngestLog.push({
      source: body.source,
      count: accepted,
      timestamp: new Date().toISOString(),
    });
    // Keep log to last 100 entries
    if (globalForSDK.sdkIngestLog.length > 100) {
      globalForSDK.sdkIngestLog = globalForSDK.sdkIngestLog.slice(-100);
    }

    return NextResponse.json({
      accepted,
      rejected,
      errors: errors.slice(0, 10), // Limit error list
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      accepted: 0,
      rejected: 0,
      errors: ['SDK request failed. Check the payload and server configuration.'],
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const denied = await authorizeSdkRead(request);
  if (denied) return denied;
  return NextResponse.json({
    sdk: 'polybolos',
    version: '1.0.0',
    entityCount: globalForSDK.sdkEntityStore.size,
    recentIngestions: globalForSDK.sdkIngestLog.slice(-10),
    timestamp: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
