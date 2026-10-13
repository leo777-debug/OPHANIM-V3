import { isIP } from 'node:net';
import { validateScanTargets } from './scan-guard';
import { normalizeFacets, normalizeHost, normalizeScan, normalizeService, number, object, text, ShodanError, type ShodanInfo, type ShodanSearch } from './types';

function setting(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new ShodanError('provider_down', 'Shodan request timed out or was cancelled. Try again later.', 504)); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, Math.max(0, ms));
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
}
export function validateQuery(query: string): string {
  if (!query.trim() || query.length > 1000) throw new ShodanError('invalid_request', 'Enter a Shodan query between 1 and 1000 characters.', 400);
  return query.trim();
}
function list(value: string, ipOnly: boolean): string[] {
  const items = [...new Set(value.split(',').map((item) => item.trim()))];
  if (items.length > 20 || items.some((item) => ipOnly ? !isIP(item) || item.includes('%') : !/^(?=.{1,253}$)[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(item))) {
    throw new ShodanError('invalid_request', `Enter 1-20 comma-separated ${ipOnly ? 'IP addresses' : 'hostnames'}.`, 400);
  }
  return items;
}
function upstreamError(status: number): ShodanError {
  const errors: Record<number, [ConstructorParameters<typeof ShodanError>[0], string]> = {
    400: ['invalid_request', 'Shodan rejected the query or targets. Check the syntax.'],
    401: ['invalid_key', 'The Shodan API key is invalid. Ask your administrator to update SHODAN_API_KEY.'],
    402: ['insufficient_credits', 'Shodan credits are exhausted. Add credits in the Shodan account.'],
    403: ['access_denied', 'The Shodan plan does not permit this operation or has reached its limit. Check your Shodan subscription.'],
    404: ['no_information', 'Shodan has no information for this host or scan.'],
    429: ['rate_limited', 'Shodan is rate limiting requests. Wait and try again.'],
  };
  const [code, message] = errors[status] ?? ['provider_down', 'Shodan is temporarily unavailable. Try again later.'];
  return new ShodanError(code, message, status >= 500 ? 502 : status);
}

export class ShodanClient {
  private nextStart = 0;
  private cache = new Map<string, { expires: number; value: unknown }>();
  private pending = new Map<string, Promise<unknown>>();
  constructor(private readonly key: string, private readonly options: { fetch?: typeof fetch; intervalMs?: number; timeoutMs?: number; cacheTtlMs?: number; clock?: () => number } = {}) {}

  private async request(path: string, params: Record<string, string> = {}, body?: URLSearchParams, outerSignal?: AbortSignal): Promise<unknown> {
    if (!this.key.trim()) throw new ShodanError('missing_key', 'Shodan is not configured. Ask your administrator to set SHODAN_API_KEY.', 503);
    const clock = this.options.clock ?? Date.now;
    const signal = AbortSignal.any([AbortSignal.timeout(this.options.timeoutMs ?? setting('SHODAN_TIMEOUT_MS', 25000, 1000, 30000)), ...(outerSignal ? [outerSignal] : [])]);
    for (let attempt = 0; attempt < (body ? 1 : 3); attempt++) {
      const start = Math.max(clock(), this.nextStart);
      this.nextStart = start + (this.options.intervalMs ?? 1000);
      await wait(start - clock(), signal);
      const url = new URL(path, 'https://api.shodan.io');
      for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
      url.searchParams.set('key', this.key);
      let response: Response;
      try {
        response = await (this.options.fetch ?? fetch)(url, { method: body ? 'POST' : 'GET', body, signal,
          cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'OPHANIM/1.0', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) } });
      } catch {
        // Never propagate fetch exceptions: they can contain the credential-bearing URL.
        throw new ShodanError('provider_down', body ? 'Scan submission could not be confirmed. Do not resubmit; ask an administrator to check Shodan.' : 'Shodan could not be reached. Try again later.', 504);
      }
      if (!body && (response.status === 429 || response.status >= 500) && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await response.body?.cancel();
        await wait(Math.max(1000 * 2 ** attempt, Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10000) : 0), signal);
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw upstreamError(response.status); }
      try {
        const raw = await response.json();
        // Defensive redaction even if an upstream payload unexpectedly echoes a key.
        const result = JSON.parse(JSON.stringify(raw).split(this.key).join('[redacted]'));
        if (object(result).error) throw upstreamError(400);
        return result;
      } catch (error) {
        if (error instanceof ShodanError) throw error;
        throw new ShodanError('provider_down', 'Shodan returned an unreadable response.', 502);
      }
    }
    throw upstreamError(429);
  }

  private async cached(key: string, load: () => Promise<unknown>, ttl = this.options.cacheTtlMs ?? setting('SHODAN_CACHE_TTL_MS', 60000, 0, 300000)): Promise<unknown> {
    const now = (this.options.clock ?? Date.now)(), entry = this.cache.get(key);
    if (entry && entry.expires > now) return entry.value;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const work = load().then((value) => {
      for (const [id, item] of this.cache) if (item.expires <= now) this.cache.delete(id);
      if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { value, expires: (this.options.clock ?? Date.now)() + ttl });
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }

  async info(signal?: AbortSignal): Promise<ShodanInfo> {
    const row = object(await this.cached('info', () => this.request('/api-info', {}, undefined, signal), 30000));
    return { query_credits: number(row.query_credits), scan_credits: number(row.scan_credits), plan: text(row.plan) };
  }
  warnings(info: ShodanInfo, kind: 'query' | 'scan'): string[] {
    const credits = kind === 'query' ? info.query_credits : info.scan_credits;
    return credits !== null && credits <= setting('SHODAN_LOW_CREDITS', 10, 0, 1000) ? [`Shodan ${kind} credits are low (${credits} remaining).`] : [];
  }
  async search(query: string, facets = '', page = 1, signal?: AbortSignal): Promise<ShodanSearch> {
    validateQuery(query);
    if (!Number.isInteger(page) || page < 1 || page > 10000 || facets.length > 300) throw new ShodanError('invalid_request', 'Invalid page or facets.', 400);
    const credits = await this.info(signal);
    const row = object(await this.request('/shodan/host/search', { query, facets, page: String(page) }, undefined, signal));
    this.cache.delete('info');
    return { matches: Array.isArray(row.matches) ? row.matches.map((item) => normalizeService(item)) : [], total: number(row.total) ?? 0,
      facets: normalizeFacets(row.facets), page, credits, warnings: this.warnings(credits, 'query') };
  }
  async count(query: string, facets = '', signal?: AbortSignal) {
    validateQuery(query);
    if (facets.length > 300) throw new ShodanError('invalid_request', 'Facets are too long.', 400);
    const row = object(await this.cached(`count:${JSON.stringify([query, facets])}`, () => this.request('/shodan/host/count', { query, facets }, undefined, signal)));
    return { total: number(row.total) ?? 0, facets: normalizeFacets(row.facets) };
  }
  async host(ip: string, history = false, minify = false, signal?: AbortSignal) {
    list(ip, true);
    if (ip.includes(',')) throw new ShodanError('invalid_request', 'Host lookup requires a single IP.', 400);
    const row = await this.cached(`host:${ip}:${history}:${minify}`, () => this.request(`/shodan/host/${encodeURIComponent(ip)}`, { history: String(history), minify: String(minify) }, undefined, signal));
    return normalizeHost(row, ip);
  }
  async hosts(ips: string, history = false, minify = false) {
    const signal = AbortSignal.timeout(30000);
    const results = [];
    for (const ip of list(ips, true)) {
      try { results.push({ ip, host: await this.host(ip, history, minify, signal) }); }
      catch (error) {
        if (!(error instanceof ShodanError) || error.code !== 'no_information') throw error;
        results.push({ ip, error: error.message, code: error.code });
      }
    }
    return { results };
  }
  async resolve(hostnames: string) {
    const names = list(hostnames, false), row = object(await this.request('/dns/resolve', { hostnames: names.join(',') }));
    return Object.fromEntries(names.map((name) => [name, text(row[name])]));
  }
  async reverse(ips: string) {
    const addresses = list(ips, true), row = object(await this.request('/dns/reverse', { ips: addresses.join(',') }));
    return Object.fromEntries(addresses.map((ip) => [ip, Array.isArray(row[ip]) ? row[ip] : []]));
  }
  async submitAuthorizedScan(targets: string[], hosts: number, allowlist: string[], confirm: boolean) {
    const validated = validateScanTargets(targets.join(','), confirm, allowlist);
    if (validated.hosts !== hosts) throw new ShodanError('invalid_request', 'The scan estimate does not match its targets.', 400);
    this.cache.delete('info');
    const credits = await this.info();
    if (credits.scan_credits !== null && credits.scan_credits >= 0 && credits.scan_credits < hosts) throw new ShodanError('insufficient_credits', `This scan needs up to ${hosts} credits; Shodan reports ${credits.scan_credits} remaining.`, 402);
    const scan = normalizeScan(await this.request('/shodan/scan', {}, new URLSearchParams({ ips: targets.join(',') })));
    this.cache.delete('info');
    return { ...scan, warnings: this.warnings(credits, 'scan') };
  }
  async scanStatus(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new ShodanError('invalid_request', 'Invalid scan ID.', 400);
    return normalizeScan(await this.request(`/shodan/scan/${encodeURIComponent(id)}`));
  }
}
let client: ShodanClient | undefined, configuredKey: string | undefined;
export function shodanClient(): ShodanClient {
  const key = process.env.SHODAN_API_KEY?.trim() ?? '';
  if (!client || key !== configuredKey) { configuredKey = key; client = new ShodanClient(key); }
  return client;
}
