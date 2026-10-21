import { describe, expect, it } from 'vitest';
import { isProhibitedContent } from './content-filter';
import { darkWebFeatures, tenantTerms } from './deep-watch';
import { hibpDomainProvider, licensedFeedProvider } from './licensed-providers';
import { mockDarkWebProvider } from './mock-provider';
import { DarkWebProviderRegistry, searchDarkWeb } from './provider-framework';
import { classifyThreats, LOGISTICS_THREAT_CATEGORIES } from './threat-categories';
import type { DarkWebProvider, RegisteredEntity } from './types';

const ctx = (allowedTerms?: string[]) => ({ signal: new AbortController().signal, organizationId: 'org-1', allowedTerms });
const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe('Deep Watch', () => {
  it('has a development fixture for every logistics threat category, and the classifier recognises each', async () => {
    for (const category of LOGISTICS_THREAT_CATEGORIES) {
      const fixtures = (await mockDarkWebProvider.search({ query: '', entityTypes: ['port'], limit: 50 }, ctx())).filter(item => item.threatCategories.includes(category));
      expect(fixtures.length, category).toBeGreaterThan(0);
      expect(fixtures[0].sourceCategory).toBe('development_fixture');
      expect(classifyThreats(`${fixtures[0].title} ${fixtures[0].originalText}`), category).toContain(category);
    }
    expect(classifyThreats('Routine berth schedule update for Jebel Ali')).toEqual([]);
  });

  it('drops prohibited content before normalisation or storage and tags logistics threats', async () => {
    const provider: DarkWebProvider = { ...mockDarkWebProvider, metadata: { ...mockDarkWebProvider.metadata, id: 'test-provider' }, supports: () => true, validateConfiguration: () => ({ valid: true, errors: [] }),
      search: async () => [
        { providerDocumentId: 'a', sourceCategory: 'development_fixture', sourceName: 'test', firstSeenAt: '2026-10-21T00:00:00Z', lastSeenAt: '2026-10-21T00:00:00Z', originalText: 'Selling blank bills of lading with stamps', sourceReliability: 30, threatCategories: [] },
        { providerDocumentId: 'b', sourceCategory: 'development_fixture', sourceName: 'test', firstSeenAt: '2026-10-21T00:00:00Z', lastSeenAt: '2026-10-21T00:00:00Z', originalText: 'csam link list', sourceReliability: 30, threatCategories: [] },
      ] };
    const result = await searchDarkWeb(new DarkWebProviderRegistry([provider]), { query: 'x', entityTypes: ['port'], limit: 10 }, ctx());
    expect(result.mentions.map(item => item.mention.providerDocumentId)).toEqual(['a']);
    expect(result.mentions[0].mention.threatCategories).toContain('fraudulent_bill_of_lading');
    expect(result.diagnostics[0]).toMatchObject({ droppedProhibited: 1 });
    expect(isProhibitedContent('Cargo theft at the gate')).toBe(false);
  });

  it('HIBP adapter queries only the tenant’s own domains and stores counts, not addresses', async () => {
    let calls = 0;
    const provider = hibpDomainProvider(env({ HIBP_API_KEY: 'synthetic' }), async () => { calls++; return new Response(JSON.stringify({ alice: ['Adobe', 'LinkedIn'], bob: ['Adobe'] }), { status: 200 }); });
    expect(provider.validateConfiguration().valid).toBe(true);
    await expect(provider.search({ query: 'someone-else.test', entityTypes: ['domain'], limit: 10 }, ctx(['example-forwarder.test']))).rejects.toThrow('registered domains');
    expect(calls).toBe(0);
    const mentions = await provider.search({ query: 'example-forwarder.test', entityTypes: ['domain'], limit: 10 }, ctx(['example-forwarder.test']));
    expect(mentions.map(item => item.title)).toEqual(['2 account(s) at example-forwarder.test appear in the Adobe breach', '1 account(s) at example-forwarder.test appear in the LinkedIn breach']);
    expect(JSON.stringify(mentions)).not.toMatch(/alice|bob/);
    expect(mentions[0].sourceCategory).toBe('licensed_intelligence');
    expect(hibpDomainProvider(env({})).validateConfiguration().valid).toBe(false);
  });

  it('licensed feed adapter requires https + token, refuses out-of-scope queries and keeps provenance', async () => {
    expect(licensedFeedProvider(env({ DEEPWATCH_FEED_URL: 'http://vendor.test/api', DEEPWATCH_FEED_TOKEN: 't' })).validateConfiguration().valid).toBe(false);
    const provider = licensedFeedProvider(env({ DEEPWATCH_FEED_URL: 'https://vendor.test/api', DEEPWATCH_FEED_TOKEN: 't', DEEPWATCH_FEED_CATEGORY: 'paste_feed' }),
      async () => new Response(JSON.stringify({ results: [{ id: 'v1', title: 'IMO 9123456 mentioned', text: 'IMO 9123456 offered for STS transfer to evade sanctions', sourceName: 'Vendor forum index', sourceReference: 'https://vendor.test/item/v1', reliability: 70, identifiers: ['9123456'] }] }), { status: 200 }));
    await expect(provider.search({ query: 'not-ours', entityTypes: ['vessel'], limit: 5 }, ctx(['9123456']))).rejects.toThrow('registered identifiers');
    const [mention] = await provider.search({ query: '9123456', entityTypes: ['vessel'], limit: 5 }, ctx(['9123456']));
    expect(mention).toMatchObject({ providerDocumentId: 'v1', sourceCategory: 'paste_feed', sourceReference: 'https://vendor.test/item/v1', sourceReliability: 70 });
    expect(licensedFeedProvider(env({ DEEPWATCH_FEED_CATEGORY: 'development_fixture' })).metadata.sourceCategories).toEqual(['licensed_intelligence']);
  });

  it('builds the tenant watchlist from registered entities and summarises corridor features', () => {
    const entities = [{ id: '1', entityType: 'port', canonicalName: 'Jebel Ali', normalizedKey: 'aejea', attributes: {}, aliases: [{ alias: 'AEJEA', identifierType: 'unlocode', identifierValue: 'AEJEA' }] },
      { id: '2', entityType: 'domain', canonicalName: 'example-forwarder.test', normalizedKey: 'x', attributes: {}, aliases: [] }] as RegisteredEntity[];
    expect(tenantTerms(entities)).toEqual(['Jebel Ali', 'AEJEA', 'example-forwarder.test']);
    const features = darkWebFeatures({ mentions: [
      { id: 'm1', title: null, sourceName: 's', sourceCategory: 'paste_feed', sourceReference: null, reliability: 40, threatCategories: ['cargo_theft'], firstSeenAt: '', reviewStatus: 'new', why: ['exact unlocode on port: Jebel Ali ("AEJEA")'], label: '' },
      { id: 'm2', title: null, sourceName: 's', sourceCategory: 'paste_feed', sourceReference: null, reliability: 40, threatCategories: ['smuggling'], firstSeenAt: '', reviewStatus: 'false_positive', why: ['weak name on port: Jebel Ali ("Jebel")'], label: '' },
    ], assessments: [{ mention_id: 'm1', subject_label: 'JF-1', assessment_status: 'unverified_claim', confidence_score: 62, confidence_level: 'medium', correlation_signals: [] }] });
    expect(features).toMatchObject({ dw_mention_count: 1, dw_strongest_match: 'exact_unlocode', dw_max_assessment_confidence: 0.62, dw_logistics_threats: 1 });
  });
});
