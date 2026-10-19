import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { validateHost } from '@/lib/ssrf-guard';
import type { IntegrationDefinition } from './catalog';

type Env = Record<string, string | undefined>;
export interface ProbeRequest { url: string; headers?: Record<string, string>; method?: 'GET' | 'POST'; body?: string; expected?: 'json' | 'text'; }
const fixed: Record<string, string> = {
  nvd: 'https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=1', epss: 'https://api.first.org/data/v1/epss?limit=1',
  osv: 'https://api.osv.dev/v1/vulns/GHSA-jfh8-c2jp-5v3q', github: 'https://api.github.com/rate_limit',
  'dns-rdap': 'https://dns.google/resolve?name=example.com&type=A', gdacs: 'https://www.gdacs.org/xml/rss.xml',
  news: 'https://feeds.bbci.co.uk/news/world/rss.xml', telegram: 'https://t.me/s/Liveuamap',
};
const envUrls: Record<string, [string, string?, string?]> = {
  'customer-ais': ['CUSTOMER_AIS_API_URL', 'CUSTOMER_AIS_API_TOKEN'], ports: ['PORT_NOTICE_FEED_URL'], sanctions: ['OFFICIAL_SANCTIONS_FEED_URL'],
  'reviewed-osint': ['REVIEWED_OSINT_FEED_URL'], 'verify-observations': ['VERIFY_OBSERVATIONS_URL'], ecmwf: ['ECMWF_FORECAST_URL'], ioda: ['IODA_API_URL'],
  scanner: ['SCANNER_URL', 'SCANNER_KEY', '/health'], research: ['AI_SANDBOX_RESEARCH_URL', 'AI_SANDBOX_RESEARCH_TOKEN', '/health'],
  voidaccess: ['VOIDACCESS_API_URL', 'VOIDACCESS_API_TOKEN', '/health'], intel: ['INTEL_URL', undefined, '/health'],
};
export function connectionProbe(service: IntegrationDefinition, env: Env): ProbeRequest | null {
  if (service.probe) return { url: service.probe };
  if (fixed[service.id]) return { url: fixed[service.id], expected: ['gdacs', 'news', 'telegram'].includes(service.id) ? 'text' : 'json' };
  if (envUrls[service.id]) {
    const [name, token, suffix] = envUrls[service.id]; if (!env[name]) return null;
    return { url: env[name]!.replace(/\/$/, '') + (suffix ?? ''), headers: token && env[token] ? { Authorization: `Bearer ${env[token]}` } : undefined };
  }
  if (['ai', 'local-model', 'embeddings'].includes(service.id)) {
    const base = env[service.id === 'ai' ? 'AI_BASE_URL' : service.id === 'embeddings' ? 'EMBEDDING_BASE_URL' : 'OPHANIM_LOCAL_BASE_URL'];
    const key = env[service.id === 'embeddings' ? 'EMBEDDING_API_KEY' : 'AI_API_KEY'];
    return base ? { url: `${base.replace(/\/$/, '').replace(/\/v1$/, '')}/v1/models`, headers: key ? { Authorization: `Bearer ${key}` } : undefined, expected: 'json' } : null;
  }
  if (service.id === 'shodan' && env.SHODAN_API_KEY) return { url: `https://api.shodan.io/api-info?key=${encodeURIComponent(env.SHODAN_API_KEY)}`, expected: 'json' };
  if (service.id === 'gemini') { const key = Array.from({ length: 8 }, (_, i) => env[`GEMINI_API_KEY_${i + 1}`]).find(Boolean); return key ? { url: 'https://generativelanguage.googleapis.com/v1beta/models', headers: { 'x-goog-api-key': key }, expected: 'json' } : null; }
  if (service.id === 'resend' && env.RESEND_API_KEY) return { url: 'https://api.resend.com/domains', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` }, expected: 'json' };
  if (service.id === 'supabase') { const base = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; return base && key ? { url: `${base.replace(/\/$/, '')}/auth/v1/health`, headers: { apikey: key }, expected: 'json' } : null; }
  return null;
}

/** Pinned, bounded transport. Never follows redirects or prints URL/key/error bodies. */
export async function runConnectionProbe(input: ProbeRequest, env: Env = process.env): Promise<void> {
  const url = new URL(input.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid configured URL.');
  const allowed = (env.INTEGRATION_ALLOWED_ORIGINS ?? env.AI_LOCAL_BASE_URLS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (/169\.254\.|metadata\./i.test(url.hostname)) throw new Error('Forbidden service address.');
  const check = await validateHost(url.hostname);
  if (!check.ok && !allowed.includes(url.origin)) throw new Error('Service origin is blocked. Configure an explicitly trusted local origin.');
  const address = check.ok ? check.resolved?.[0] : undefined;
  const lookup: LookupFunction | undefined = address ? (_host, options, callback) => options.all ? callback(null, [{ address, family: isIP(address) }]) : callback(null, address, isIP(address)) : undefined;
  await new Promise<void>((resolve, reject) => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
    const finish = (error?: Error) => { clearTimeout(timer); if (error) reject(error); else resolve(); };
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = send(url, { method: input.method ?? 'GET', signal: controller.signal, agent: false,
      headers: { Accept: 'application/json, application/xml, text/plain', 'Accept-Encoding': 'identity', 'User-Agent': 'Ophanim/1.0 integration test', ...input.headers },
      ...(lookup ? { lookup } : {}),
    }, response => {
      if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) { response.resume(); finish(new Error(`Provider returned HTTP ${response.statusCode ?? 500}.`)); return; }
      let size = 0; const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 2000000) response.destroy(new Error('Response size limit exceeded.')); else chunks.push(chunk); });
      response.on('error', () => finish(new Error('Connection interrupted.')));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (!text.trim()) { finish(new Error('Provider returned no payload.')); return; }
        if (input.expected === 'json') { try { JSON.parse(text); } catch { finish(new Error('Provider returned invalid JSON.')); return; } }
        finish();
      });
    });
    request.on('error', () => finish(new Error('Service not running, unreachable or timed out.')));
    if (input.body) request.write(input.body); request.end();
  });
}
