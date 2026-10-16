import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { validateHost } from '@/lib/ssrf-guard';

export interface PinnedRequestOptions {
  method?: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  httpsOnly?: boolean;
  signal?: AbortSignal | null;
  redirect?: 'error' | 'manual';
}

export async function pinnedPublicFetch(input: string | URL, options: PinnedRequestOptions = {}): Promise<Response> {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (options.httpsOnly && url.protocol !== 'https:')) throw new Error('Public HTTP(S) endpoint required.');
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 15000);
  const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline;
  signal.throwIfAborted();
  const checked = await Promise.race([
    validateHost(url.hostname),
    new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('Endpoint validation timed out.')), { once: true })),
  ]);
  if (!checked.ok || !checked.resolved?.length) throw new Error('Endpoint resolves to a blocked or unavailable address.');
  for (const address of checked.resolved) {
    if (!isIP(address) || !(await validateHost(address)).ok) throw new Error('DNS returned a reserved address.');
  }
  const address = checked.resolved[0];
  const maxBytes = options.maxResponseBytes ?? 2 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    // Pin the checked socket address while preserving the original TLS/Host identity.
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(url, {
      signal, agent: false, method: options.method ?? 'GET',
      headers: { ...options.headers, 'Accept-Encoding': 'identity' },
      lookup: (_host, lookupOptions, callback) => {
        const family = isIP(address);
        if (lookupOptions.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      },
    }, (res) => {
      const status = res.statusCode ?? 502;
      const headers = new Headers();
      for (const [key, value] of Object.entries(res.headers)) {
        if (Array.isArray(value)) for (const entry of value) headers.append(key, entry);
        else if (value !== undefined) headers.set(key, value);
      }
      if (status >= 300 && status < 400) {
        res.resume();
        if (options.redirect === 'manual') resolve(new Response(null, { status, headers }));
        else reject(new Error('Endpoint redirects are not permitted.'));
        return;
      }
      if (options.method !== 'HEAD' && (Number(res.headers['content-length'] ?? 0) > maxBytes || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity'))) {
        res.destroy(); reject(new Error('Endpoint response exceeds the permitted format or size.')); return;
      }
      const chunks: Buffer[] = []; let bytes = 0;
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) res.destroy(new Error('Endpoint response exceeds the size limit.'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve(new Response(options.method === 'HEAD' || status === 204 || status === 205 || status === 304 ? null : Buffer.concat(chunks), { status, headers })));
    });
    req.on('error', reject); req.end(options.body);
  });
}
