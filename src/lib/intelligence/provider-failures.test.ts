import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({article:vi.fn()}));
vi.mock('@/lib/verify/url-fetch',()=>({fetchArticle:mocks.article}));
vi.mock('@/lib/ssrf-guard',()=>({isRateLimited:()=>false}));
import { defaultIntelligenceEventProviders, usgsEarthquakeProvider } from './event-providers';
import { verifyEventProviders } from '@/lib/verify/providers';
import { collectIntelligenceEvents, IntelligenceEventProviderRegistry } from './event-provider-registry';
import type { IntelligenceEventProvider } from './event-provider';
const providers=[...defaultIntelligenceEventProviders,...verifyEventProviders];
beforeEach(()=>{
  for(const key of ['PORT_NOTICE_FEED_URL','OFFICIAL_SANCTIONS_FEED_URL','REVIEWED_OSINT_FEED_URL','VERIFY_OBSERVATIONS_URL','VERIFY_OBSERVATIONS_TERMS_URL'])vi.stubEnv(key,'https://fixtures.example.test/data');
  for(const key of ['VERIFY_METAR_COMMERCIAL_USE','VERIFY_OBSERVATIONS_COMMERCIAL_USE'])vi.stubEnv(key,'yes');
  vi.stubEnv('VERIFY_OBSERVATIONS_LICENSE','Synthetic test rights only');vi.stubEnv('VERIFY_OBSERVATIONS_ATTRIBUTION','Synthetic test provider');
  vi.clearAllMocks();
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe.each(providers)('$id failure isolation',provider=>{
  it.each(['http-error','garbage','empty','timeout'] as const)('%s does not suppress another source',async mode=>{
    const upstream=vi.fn(async()=>{
      if(mode==='timeout')return new Promise<Response>(()=>{});
      return new Response(mode==='garbage'?'not-json':JSON.stringify(mode==='empty'?[]:{}),{status:mode==='http-error'?503:200});
    });
    vi.stubGlobal('fetch',upstream);
    mocks.article.mockImplementation(async()=>{
      if(mode==='timeout')return new Promise(()=>{});
      if(mode==='http-error')throw new Error('Synthetic upstream unavailable');
      return {text:mode==='garbage'?'not-json':'[]'};
    });
    const healthy:IntelligenceEventProvider={...usgsEarthquakeProvider,id:'fixture-healthy',fetch:async()=>({features:[{id:'fixture',properties:{place:'Synthetic test location',mag:5,status:'reviewed',time:Date.parse('2026-10-15T00:00:00Z')},geometry:{coordinates:[55,25]}}]})};
    const airportCode={ 'http-error':'TSTA',garbage:'TSTB',empty:'TSTC',timeout:'TSTD' }[mode];
    const result=await collectIntelligenceEvents({providerIds:[provider.id,healthy.id],parameters:{airportCode},now:new Date('2026-10-15T00:00:00Z')},new IntelligenceEventProviderRegistry([{...provider,timeoutMs:20},healthy]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0].externalId).toBe('usgs:fixture');
    expect(result.diagnostics[1]).toMatchObject({status:'success',eventCount:1});
    expect(result.diagnostics[0].status).toBe(mode==='empty'?'success':'error');
    expect(result.diagnostics[0].eventCount).toBe(0);
    expect(upstream.mock.calls.length+mocks.article.mock.calls.length).toBeGreaterThan(0);
    if(mode==='timeout')expect(result.diagnostics[0].message).toBe('Provider timed out.');
  });
});
