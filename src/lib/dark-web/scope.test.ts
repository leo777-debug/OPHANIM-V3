import { describe,it,expect } from 'vitest';
import {matchMentionEntities} from './entity-matching';
import {normalizeMention} from './normalize';
import { scopedQuery,safeMetadata } from './scope';
import { mockDarkWebProvider } from './mock-provider';
import { searchCameraPorts,playable,cameraCatalogue } from '@/lib/watchtower/catalogue';
describe('Lawful customer-scoped sources',()=>{
 const entities=[{id:'1',entityType:'domain' as const,canonicalName:'tenant.example',normalizedKey:'tenant.example',attributes:{},aliases:[]}];
 it('rejects appended queries and unrelated assets',()=>{
  expect(scopedQuery('tenant.example',entities)).toBeTruthy();
  expect(scopedQuery('tenant.example OR other.example',entities)).toBeUndefined();
  expect(scopedQuery('other.example',entities)).toBeUndefined();
 });
 it('does not inflate substring domain/IMO matches into exact identities',()=>{
  const raw={providerDocumentId:'test',sourceCategory:'development_fixture' as const,sourceName:'test',firstSeenAt:'2026-10-21T00:00:00Z',lastSeenAt:'2026-10-21T00:00:00Z',originalText:'tenant.example.evil and 191234567',sourceReliability:20,threatCategories:[]};
  const registered=[...entities,{...entities[0],id:'2',entityType:'vessel' as const,canonicalName:'Test Vessel',aliases:[{alias:'9123456',identifierType:'imo',identifierValue:'9123456'}]}];
  expect(matchMentionEntities(normalizeMention('test',raw),registered)).toEqual([]);
 });
 it('rejects prohibited content categories before normalization',()=>{
  expect(safeMetadata({originalText:'blocked',threatCategories:['csam']})).toBe(false);
 });
 it('keeps all five logistics fixtures explicitly fictional',async()=>{
  const rows=await mockDarkWebProvider.search({query:'Example Client',entityTypes:['client'],limit:50},{signal:new AbortController().signal,organizationId:'test'});
  for(const category of ['cargo_theft','smuggling','sanctions_evasion_brokering','fraudulent_bills_of_lading','logistics_fraud'])expect(rows.some(r=>r.sourceCategory==='development_fixture'&&r.threatCategories.includes(category))).toBe(true);
 });
 it('shows unknown Iranian coverage and refuses offline/unlicensed playback',()=>{
  expect(searchCameraPorts('Bandar Abbas')[0].gap).toContain('Unverified');
  expect(searchCameraPorts('Fujairah anchorage')[0].code).toBe('AEFJR');
  expect(playable(cameraCatalogue[0])).toBe(false);
 });
});
