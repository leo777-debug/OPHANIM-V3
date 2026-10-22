import {describe,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mergedPortGazetteer,PORT_REFERENCE} from './port-gazetteer';
import data from './port-gazetteer.json';
import {extractEntities,correlateEntities,clusterStories,normalizeTitle,whyItMatters} from './analysis';
import {MARITIME_NETWORK} from '@/lib/route-intelligence/reference';
import type {NewsItem} from './news';
const dictionary=mergedPortGazetteer();
const item=(id:string,source:string):NewsItem=>({id,source,title:'Port of Durres issues a synthetic test notice',description:'Reference code port ALDRZ; fixture only.',link:`https://fixture.invalid/${id}`,published:'2026-10-21T00:00:00Z',coords:null,coords_default:false,risk_score:0});
describe('pinned conservative port reference matching',()=>{
 it('derives from the licensed pinned original without geometry in the dictionary',()=>{
  expect(PORT_REFERENCE.sourceRecordCount).toBe(3962);expect(PORT_REFERENCE.entryCount).toBe(data.entries.length);expect(PORT_REFERENCE.entryCount).toBeGreaterThan(3900);
  expect(PORT_REFERENCE.sourceSha256).toBe(MARITIME_NETWORK.portsSha256);
  expect(createHash('sha256').update(readFileSync('public/reference/ports.geojson')).digest('hex')).toBe(PORT_REFERENCE.sourceSha256);
  expect(PORT_REFERENCE.commercialUse).toBe('yes');expect(PORT_REFERENCE.licence).toBe('Apache-2.0');
  for(const entry of data.entries)expect(Object.keys(entry).sort()).toEqual(['aliases','id','label','type']);
 });
 it('withholds ambiguous phrases and requires explicit port markers rather than bare city names',()=>{
  const aliases=new Map<string,string>();
  for(const entry of data.entries)for(const alias of entry.aliases){const key=normalizeTitle(alias);expect(aliases.get(key)??entry.id).toBe(entry.id);aliases.set(key,entry.id);}
  expect(PORT_REFERENCE.withheldAliases).toBeGreaterThan(0);
  for(const text of ['Durres','Victoria','ALDRZ'])expect(extractEntities(text,dictionary).filter(entry=>entry.type==='port')).toEqual([]);
  const explicit=extractEntities('Port of Durres; port code ALDRZ.',dictionary).filter(entry=>entry.type==='port');
  expect(explicit).toHaveLength(1);expect(explicit[0].id).toBe('port:marnet:ALDRZ');
  expect(extractEntities('ميناء Durres',dictionary).find(entry=>entry.id==='port:marnet:ALDRZ')).toBeDefined();
 });
 it('preserves existing curated identities, immutable references and reusable dictionary indexes',()=>{
  expect(mergedPortGazetteer()).toBe(dictionary);expect(Object.isFrozen(dictionary)).toBe(true);
  const entities=extractEntities('Port of Jebel Ali and Port of Rotterdam',dictionary).filter(entry=>entry.type==='port');
  expect(entities.map(entry=>entry.id).sort()).toEqual(['port:jebel-ali','port:rotterdam']);
  const before=JSON.stringify(dictionary);extractEntities('Port of Durres',dictionary);expect(JSON.stringify(dictionary)).toBe(before);
 });
 it('uses the same evidence-backed identities in stories, cross-publisher links and context without inventing event coordinates',()=>{
  const news=[item('a','BBC'),item('b','NASA')],before=JSON.stringify(news);
  const linked=correlateEntities(news,dictionary).find(record=>record.entity.id==='port:marnet:ALDRZ');
  expect(linked).toMatchObject({articleIds:['a','b'],publishers:['BBC','NASA']});
  expect(clusterStories(news,{dictionary,now:Date.parse('2026-10-21T01:00:00Z')})[0].entities.some(entity=>entity.id==='port:marnet:ALDRZ')).toBe(true);
  expect(whyItMatters(news[0],dictionary).entities.some(entity=>entity.id==='port:marnet:ALDRZ')).toBe(true);
  expect(JSON.stringify(news)).toBe(before);expect(linked?.entity).not.toHaveProperty('lat');expect(linked?.entity).not.toHaveProperty('coordinates');
 });
});
