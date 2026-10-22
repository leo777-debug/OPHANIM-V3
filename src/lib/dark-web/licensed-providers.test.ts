import { beforeEach,describe,expect,it,vi } from 'vitest';
import { licensedFeedProvider } from './licensed-providers';
const env={DEEPWATCH_FEED_URL:'https://feed.example/defensive',DEEPWATCH_FEED_TOKEN:'test-only',DEEPWATCH_FEED_ORGANIZATION_ID:'tenant-one',DEEPWATCH_FEED_SAFE_METADATA_ONLY:'true',DEEPWATCH_FEED_TERMS_URL:'https://feed.example/terms'};
const query={query:'customer.example',entityTypes:['domain' as const],limit:20};
const context={organizationId:'tenant-one',signal:new AbortController().signal,allowedTerms:['customer.example']};
const hit={id:'one',text:'customer.example cargo theft discussion; unverified',identifiers:['customer.example'],categories:['cargo_theft'],reliability:60,sourceReference:'https://feed.example/evidence/one'};
const fetcher=vi.fn();beforeEach(()=>fetcher.mockReset());
describe('tenant-scoped licensed defensive feed',()=>{
 it('rejects a missing contract, another tenant and injected queries before any request',async()=>{
  expect(licensedFeedProvider({...env,DEEPWATCH_FEED_SAFE_METADATA_ONLY:''}).validateConfiguration().valid).toBe(false);
  const provider=licensedFeedProvider(env,fetcher);
  await expect(provider.search(query,{...context,organizationId:'tenant-two'})).rejects.toThrow();
  await expect(provider.search({...query,query:'customer.example OR victim.example'},context)).rejects.toThrow();
  await expect(provider.search(query,{...context,allowedTerms:[]})).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
 });
 it('keeps safe scoped summaries and provenance; drops dumps, illegal markers and unrelated identifiers',async()=>{
  fetcher.mockResolvedValue(new Response(JSON.stringify({results:[hit,{...hit,id:'two',attachments:['x']},{...hit,id:'three',text:'CSAM'},{...hit,id:'four',identifiers:['victim.example']}]})));
  const rows=await licensedFeedProvider(env,fetcher).search(query,context);
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({providerDocumentId:'one',sourceCategory:'licensed_intelligence',sourceReliability:60,threatCategories:['cargo_theft'],sourceReference:hit.sourceReference});
  expect(fetcher.mock.calls[0][1].maxRedirects).toBe(0);expect(JSON.stringify(rows)).not.toContain('test-only');
 });
 it('honors vendor Retry-After without a second call',async()=>{
  fetcher.mockResolvedValue(new Response('',{status:429,headers:{'Retry-After':'120'}}));
  const provider=licensedFeedProvider(env,fetcher);
  await expect(provider.search(query,context)).rejects.toThrow();await expect(provider.search(query,context)).rejects.toThrow('request limit');expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('bounds metadata payload size even without a Content-Length header',async()=>{
  fetcher.mockResolvedValue(new Response(' '.repeat(1_000_001)));
  await expect(licensedFeedProvider(env,fetcher).search(query,context)).rejects.toThrow('size limit');
 });
});
