// Licensed, reputable sources for Deep Watch. Monitor and report only: no crawling
// of marketplaces, no purchases, no interaction. Every query is limited to the
// tenant's own registered identifiers (context.allowedTerms); anything else is refused.
import { DARK_WEB_ENTITY_TYPES, DARK_WEB_SOURCE_CATEGORIES, type DarkWebProvider, type DarkWebProviderContext, type DarkWebRawMention, type DarkWebSourceCategory } from './types';

const clean = (value: unknown, max = 20000) => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : undefined;
const allowed = (query: string, context: DarkWebProviderContext) => Boolean(context.allowedTerms?.some(term => term.toLowerCase() === query.trim().toLowerCase()));
const base = { normalize: (raw: DarkWebRawMention) => ({ ...raw, title: clean(raw.title, 300), originalText: clean(raw.originalText) ?? '', sourceReference: raw.sourceReference?.startsWith('https://') ? raw.sourceReference : undefined }),
  redact: (raw: DarkWebRawMention) => ({ ...raw, originalText: raw.originalText.slice(0, 20000) }) };

/** Have I Been Pwned domain search: accounts at the tenant's verified domains seen in breaches. Stores counts, never the addresses. */
export function hibpDomainProvider(env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): DarkWebProvider {
  return {
    ...base,
    metadata: { id: 'hibp-domain-search', name: 'Have I Been Pwned: domain search', description: 'Breached accounts at your own verified email domains.', sourceCategories: ['licensed_intelligence'], supportedEntityTypes: ['domain', 'company', 'client'],
      authenticationRequirements: ['HIBP API key; domains must be verified in the key owner’s HIBP dashboard'], environmentVariables: ['HIBP_API_KEY'], rateLimitPerMinute: 10, timeoutMs: 10000, enabled: true, commercialUse: 'allowed',
      retentionHours: 24 * 90, supportsHistoricalSearch: true, supportsContinuousMonitoring: true, supportsOriginalTimestamps: false, supportsSourceReferences: true, attachmentBehavior: 'none' },
    supports: query => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(query.query.trim()),
    async search(query, context) {
      if (!allowed(query.query, context)) throw new Error('Query is not one of this organization’s registered domains.');
      const domain = query.query.trim().toLowerCase();
      const response = await fetcher(`https://haveibeenpwned.com/api/v3/breacheddomain/${encodeURIComponent(domain)}`, { headers: { 'hibp-api-key': env.HIBP_API_KEY!, 'user-agent': 'Ophanim-DeepWatch' }, redirect: 'error', signal: AbortSignal.any([context.signal, AbortSignal.timeout(10000)]) });
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`HIBP unavailable (HTTP ${response.status}).`);
      const body = await response.json() as Record<string, string[]>, counts = new Map<string, number>();
      for (const breaches of Object.values(body)) for (const breach of breaches) counts.set(breach, (counts.get(breach) ?? 0) + 1);
      const now = new Date().toISOString();
      return [...counts.entries()].slice(0, query.limit).map(([breach, accounts]) => ({ providerDocumentId: `hibp:${domain}:${breach}`, sourceCategory: 'licensed_intelligence' as const, sourceName: `Have I Been Pwned (${breach})`,
        sourceReference: `https://haveibeenpwned.com/PwnedWebsites#${encodeURIComponent(breach)}`, firstSeenAt: now, lastSeenAt: now, originalLanguage: 'en', title: `${accounts} account(s) at ${domain} appear in the ${breach} breach`,
        originalText: `${accounts} email account(s) at ${domain} appear in the ${breach} breach. Credential leak: reset passwords and review access.`, sourceReliability: 85, matchedIdentifiers: [domain], threatCategories: ['credential_leak'] }));
    },
    async health() { return env.HIBP_API_KEY ? { status: 'healthy' as const } : { status: 'misconfigured' as const, detail: 'Set HIBP_API_KEY.' }; },
    validateConfiguration() { return env.HIBP_API_KEY ? { valid: true, errors: [] } : { valid: false, errors: ['HIBP_API_KEY is not set.'] }; },
  };
}

/** Generic licensed threat-intelligence feed (breach / dark-web monitoring vendor) over HTTPS. */
export function licensedFeedProvider(env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): DarkWebProvider {
  const category = (DARK_WEB_SOURCE_CATEGORIES.includes(env.DEEPWATCH_FEED_CATEGORY as DarkWebSourceCategory) && env.DEEPWATCH_FEED_CATEGORY !== 'development_fixture' ? env.DEEPWATCH_FEED_CATEGORY : 'licensed_intelligence') as DarkWebSourceCategory;
  const configured = () => { try { const url = new URL(env.DEEPWATCH_FEED_URL ?? ''); return url.protocol === 'https:' && !url.username && !url.password && Boolean(env.DEEPWATCH_FEED_TOKEN); } catch { return false; } };
  return {
    ...base,
    metadata: { id: 'licensed-threat-feed', name: env.DEEPWATCH_FEED_NAME || 'Licensed threat-intelligence feed', description: 'Your contracted dark-web / breach monitoring vendor.', sourceCategories: [category], supportedEntityTypes: [...DARK_WEB_ENTITY_TYPES],
      authenticationRequirements: ['Vendor contract and API token'], environmentVariables: ['DEEPWATCH_FEED_URL', 'DEEPWATCH_FEED_TOKEN', 'DEEPWATCH_FEED_CATEGORY', 'DEEPWATCH_FEED_NAME'], rateLimitPerMinute: 30, timeoutMs: 15000, enabled: true, commercialUse: 'review_required',
      retentionHours: 24 * 90, supportsHistoricalSearch: true, supportsContinuousMonitoring: true, supportsOriginalTimestamps: true, supportsSourceReferences: true, attachmentBehavior: 'none' },
    supports: query => query.query.trim().length >= 3,
    async search(query, context) {
      if (!allowed(query.query, context)) throw new Error('Query is not one of this organization’s registered identifiers.');
      const response = await fetcher(env.DEEPWATCH_FEED_URL!, { method: 'POST', redirect: 'error', signal: AbortSignal.any([context.signal, AbortSignal.timeout(15000)]), headers: { Authorization: `Bearer ${env.DEEPWATCH_FEED_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query.query.trim(), entityTypes: query.entityTypes, limit: Math.min(query.limit, 50) }) });
      if (!response.ok) throw new Error(`Licensed feed unavailable (HTTP ${response.status}).`);
      const results = ((await response.json()) as { results?: Array<Record<string, unknown>> }).results ?? [], now = new Date().toISOString();
      return results.slice(0, query.limit).flatMap(item => {
        const text = clean(item.text) ?? '';
        if (!item.id || !text) return [];
        return [{ providerDocumentId: String(item.id).slice(0, 200), sourceCategory: category, sourceName: clean(item.sourceName, 200) ?? metadataName(env), sourceReference: typeof item.sourceReference === 'string' ? item.sourceReference : undefined,
          publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : undefined, firstSeenAt: typeof item.firstSeenAt === 'string' ? item.firstSeenAt : now, lastSeenAt: now, originalLanguage: clean(item.language, 10), originalText: text, title: clean(item.title, 300),
          sourceReliability: Math.max(0, Math.min(100, Number(item.reliability ?? 50))), matchedIdentifiers: Array.isArray(item.identifiers) ? item.identifiers.map(String).slice(0, 20) : [query.query], threatCategories: Array.isArray(item.categories) ? item.categories.map(String).slice(0, 20) : [] }];
      });
    },
    async health() { return configured() ? { status: 'healthy' as const } : { status: 'misconfigured' as const, detail: 'Set DEEPWATCH_FEED_URL (https) and DEEPWATCH_FEED_TOKEN.' }; },
    validateConfiguration() { return configured() ? { valid: true, errors: [] } : { valid: false, errors: ['DEEPWATCH_FEED_URL (https) and DEEPWATCH_FEED_TOKEN are required.'] }; },
  };
}
const metadataName = (env: NodeJS.ProcessEnv) => env.DEEPWATCH_FEED_NAME || 'Licensed threat-intelligence feed';
