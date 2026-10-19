import { NextRequest } from 'next/server';
import { authorizeSdkRead } from '@/lib/integrations/sdk-access';

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  POLYBOLOS SDK — SSE Stream Endpoint                            ║
 * ║  Server-Sent Events for real-time entity streaming              ║
 * ║                                                                 ║
 * ║  GET /api/sdk/stream → Opens an SSE connection that pushes      ║
 * ║  normalized Polybolos entities to the client in real-time.       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// In-memory entity store shared across the SDK endpoints
const globalForSDK = globalThis as unknown as {
  sdkEntityStore: Map<string, unknown>;
  sdkLastUpdate: number;
};

if (!globalForSDK.sdkEntityStore) {
  globalForSDK.sdkEntityStore = new Map();
  globalForSDK.sdkLastUpdate = 0;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await authorizeSdkRead(request);
  if (denied) return denied;
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      // Send initial status
      const statusEvent = {
        type: 'status',
        timestamp: new Date().toISOString(),
        payload: {
          connected: true,
          entityCount: globalForSDK.sdkEntityStore.size,
          feedCount: null,
          latticeStatus: 'disconnected',
          lastUpdate: globalForSDK.sdkLastUpdate ? new Date(globalForSDK.sdkLastUpdate).toISOString() : null,
        },
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(statusEvent)}\n\n`));

      // Send heartbeat every 15 seconds
      const heartbeat = setInterval(() => {
        try {
          const hb = {
            type: 'heartbeat',
            timestamp: new Date().toISOString(),
            payload: { entityCount: globalForSDK.sdkEntityStore.size },
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(hb)}\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      // Send entity updates every 5 seconds if data has changed
      let lastSentVersion = 0;
      const entityPush = setInterval(() => {
        try {
          if (globalForSDK.sdkLastUpdate > lastSentVersion) {
            lastSentVersion = globalForSDK.sdkLastUpdate;
            const entities = Array.from(globalForSDK.sdkEntityStore.values()).slice(0, 500);
            const event = {
              type: 'entity_update',
              timestamp: new Date().toISOString(),
              payload: entities,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
        } catch {
          clearInterval(entityPush);
          clearInterval(heartbeat);
        }
      }, 5000);
      const expiry = setTimeout(() => { cleanup(); try { controller.close(); } catch { /* Already closed. */ } }, 60000);
      const abort = () => { cleanup(); try { controller.close(); } catch { /* Already closed. */ } };
      cleanup = () => { clearInterval(entityPush); clearInterval(heartbeat); clearTimeout(expiry); request.signal.removeEventListener('abort', abort); };
      request.signal.addEventListener('abort', abort, { once: true });
      if (request.signal.aborted) abort();
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
