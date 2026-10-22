import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { lookup as resolveHost } from 'node:dns/promises';
import { validateHost } from '@/lib/ssrf-guard';
import type { IntegrationDefinition } from './catalog';
import { aiAuthorization, aiEndpoint } from '@/lib/ai/providers/openai-compatible-provider';

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
  voidaccess: ['VOIDACCESS_API_URL', 'VOIDACCESS_API_TOKEN', '/health'], intel: ['INTEL_URL', 'INTEL_API_TOKEN', '/health'],
};
export function connectionProbe(service: IntegrationDefinition, env: Env): ProbeRequest | null {
  if (service.probe) return { url: service.probe };
  if (fixed[service.id]) return { url: fixed[service.id], expected: ['gdacs', 'news', 'telegram'].includes(service.id) ? 'text' : 'json' };
  if (envUrls[service.id]) {
    const [name, token, suffix] = envUrls[service.id]; if (!env[name]) return null;
    let target = env[name]!;
    if (suffix) { try { const base = new URL(target); base.pathname = base.pathname.replace(/\/$/, '') + suffix; base.search = ''; base.hash = ''; target = base.toString(); } catch { /* Transport records the invalid configuration without exposing it. */ } }
    return { url: target, headers: token && env[token] ? { Authorization: `Bearer ${env[token]}` } : undefined, ...(['research', 'scanner', 'intel'].includes(service.id) ? { expected: 'json' as const } : {}) };
  }
  if (['ai', 'local-model', 'embeddings'].includes(service.id)) {
    const base = env[service.id === 'ai' ? 'AI_BASE_URL' : service.id === 'embeddings' ? 'EMBEDDING_BASE_URL' : 'OPHANIM_LOCAL_BASE_URL'];
    // Local inference is keyless. Never forward the unrelated hosted AI credential.
    const key = service.id === 'ai' ? env.AI_API_KEY : service.id === 'embeddings' ? env.EMBEDDING_API_KEY : undefined;
    return base ? { url: aiEndpoint(base, 'models').toString(), headers: aiAuthorization(key ?? ''), expected: 'json' } : null;
  }
  if (service.id === 'shodan' && env.SHODAN_API_KEY) return { url: `https://api.shodan.io/api-info?key=${encodeURIComponent(env.SHODAN_API_KEY)}`, expected: 'json' };
  if (service.id === 'windy-webcams' && env.WINDY_WEBCAMS_API_KEY) return { url: 'https://api.windy.com/webcams/api/v3/webcams?limit=1&include=location', headers: { 'x-windy-api-key': env.WINDY_WEBCAMS_API_KEY }, expected: 'json' };
  if (service.id === 'gemini') { const key = Array.from({ length: 8 }, (_, i) => env[`GEMINI_API_KEY_${i + 1}`]).find(Boolean); return key ? { url: 'https://generativelanguage.googleapis.com/v1beta/models', headers: { 'x-goog-api-key': key }, expected: 'json' } : null; }
  if (service.id === 'resend' && env.RESEND_API_KEY) return { url: 'https://api.resend.com/domains', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` }, expected: 'json' };
  if (service.id === 'supabase') { const base = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; return base && key ? { url: `${base.replace(/\/$/, '')}/auth/v1/health`, headers: { apikey: key }, expected: 'json' } : null; }
  return null;
}

/** Pinned transport with one DNS + socket + body deadline. No redirects or upstream errors. */
export async function requestIntegration(input: ProbeRequest, env: Env = process.env, budgetMs = 8000): Promise<string> {
  const url = new URL(input.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid configured URL.');
  const allowed = [env.INTEGRATION_ALLOWED_ORIGINS, env.AI_LOCAL_BASE_URLS].filter(Boolean).join(',').split(',').map(value => value.trim()).filter(Boolean);
  const trusted = allowed.includes(url.origin), host = url.hostname.replace(/^\[|\]$/g, '');
  const forbidden = (value: string) => /^(169\.254\.|fe[89ab][0-9a-f]:|fd00:ec2::254$|::ffff:|64:ff9b:)/i.test(value) || /metadata\./i.test(value);
  if (forbidden(host)) throw new Error('Forbidden service address.');
  if (url.protocol !== 'https:' && !trusted) throw new Error('HTTP requires an explicitly trusted service origin.');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Service not running, unreachable or timed out.')); }, budgetMs); });
  // A system DNS lookup cannot be cancelled, but a late answer never opens a socket.
  const resolveAddress = async () => {
    if (trusted) {
      const answers = isIP(host) ? [{ address: host }] : await resolveHost(host, { all: true });
      if (!answers.length || answers.some(answer => forbidden(answer.address))) throw new Error('Forbidden service address.');
      return answers[0].address;
    }
    const check = await validateHost(host);
    if (!check.ok || !check.resolved?.length) throw new Error('Service origin is blocked. Configure an explicitly trusted local origin.');
    return check.resolved[0];
  };
  try {
    const address = await Promise.race([resolveAddress(), timeout]);
    if (controller.signal.aborted) throw new Error('Service timed out.');
    const lookup: LookupFunction = (_host, options, callback) => options.all ? callback(null, [{ address, family: isIP(address) }]) : callback(null, address, isIP(address));
    return await Promise.race([new Promise<string>((resolve, reject) => {
    const finish = (error?: Error, value = '') => { if (error) reject(error); else resolve(value); };
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = send(url, { method: input.method ?? 'GET', signal: controller.signal, agent: false,
      headers: { Accept: 'application/json, application/xml, text/plain', 'Accept-Encoding': 'identity', 'User-Agent': 'Ophanim/1.0 integration test', ...input.headers },
      lookup,
    }, response => {
      if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) { response.resume(); finish(new Error(`Provider returned HTTP ${response.statusCode ?? 500}.`)); return; }
      let size = 0; const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 2000000) response.destroy(new Error('Response size limit exceeded.')); else chunks.push(chunk); });
      response.on('error', () => finish(new Error('Connection interrupted.')));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (!text.trim()) { finish(new Error('Provider returned no payload.')); return; }
        if (input.expected === 'json') { try { JSON.parse(text); } catch { finish(new Error('Provider returned invalid JSON.')); return; } }
        finish(undefined, text);
      });
    });
    request.on('error', () => finish(new Error('Service not running, unreachable or timed out.')));
    if (input.body) request.write(input.body); request.end();
    }), timeout]);
  } finally { clearTimeout(timer); controller.abort(); }
}

export async function runConnectionProbe(input: ProbeRequest, env: Env = process.env): Promise<void> {
  await requestIntegration(input, env);
}
