import { publicSourceUpdates } from '@/lib/intelligence/public-source-updates';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import type { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (isRateLimited(`public-updates:${getClientIp(request)}`, 20)) return new Response('Please retry later.', { status: 429, headers: { 'Retry-After': '60' } });
  let cleanup = () => {};
  let accepted = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encode = new TextEncoder(); let closed = false;
      const timers: { heartbeat?: ReturnType<typeof setInterval>; lifetime?: ReturnType<typeof setTimeout> } = {};
      let release: (() => void) | null = null;
      cleanup = () => {
        if (closed) return; closed = true;
        if (timers.heartbeat) clearInterval(timers.heartbeat); if (timers.lifetime) clearTimeout(timers.lifetime);
        release?.(); request.signal.removeEventListener('abort', cleanup);
        try { controller.close(); } catch { /* Reader already cancelled. */ }
      };
      const send = (text: string) => { if (!closed) { try { controller.enqueue(encode.encode(text)); } catch { cleanup(); } } };
      release = publicSourceUpdates.subscribe(update => send(`id: ${update.revision}\nevent: public-update\ndata: ${JSON.stringify(update)}\n\n`));
      if (!release) { accepted = false; cleanup(); return; }
      send('retry: 3000\n: Ophanim public-source polling notifications; not upstream streaming\n\n');
      timers.heartbeat = setInterval(() => send(': transport heartbeat; not a source observation\n\n'), 15000);
      timers.lifetime = setTimeout(cleanup, 55000);
      request.signal.addEventListener('abort', cleanup, { once: true });
      if (request.signal.aborted) cleanup();
    },
    cancel() { cleanup(); },
  });
  if (!accepted) return new Response('Public update capacity reached. Browser polling remains available.', { status: 503, headers: { 'Retry-After': '60' } });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' } });
}
