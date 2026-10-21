import {describe,expect,it} from 'vitest';
import {buildEvidenceGraph,evidenceSourceUrl,newsEvidence,quakeEvidence,fireEvidence,normalizedEvidence,type EvidenceRecord} from './evidence-graph';
import type {NormalizedIntelligenceEvent} from './event-provider';
const record=(id:string,kind='news',scope:string|null=null):EvidenceRecord=>({id,kind,provider:kind,source:kind==='news'?'BBC':'USGS',title:'United Arab Emirates fixture report',text:'Reference mention only.',url:'https://fixture.invalid/evidence',publishedAt:'2026-10-21T00:00:00Z',organizationScope:scope,mode:'unknown'});
const now=Date.parse('2026-10-21T01:00:00Z');
describe('scoped cross-feed mention graph',()=>{
 it('links shared country mentions across feed types without inferring coordinates, common cause or identity',()=>{
  const input=[record('news'),record('quake','seismic')],before=JSON.stringify(input);
  const graph=buildEvidenceGraph(input,{now});
  expect(graph.records).toHaveLength(2);expect(graph.entities.find(entity=>entity.id==='country:AE')).toMatchObject({kinds:['news','seismic']});
  expect(graph.edges).toHaveLength(2);expect(graph.edges.every(edge=>edge.relation==='mentions')).toBe(true);
  expect(JSON.stringify(graph)).not.toMatch(/"coordinates"|"lat"|"lng"|"causes"/);expect(JSON.stringify(input)).toBe(before);
 });
 it('never leaks foreign/missing scopes or their counts into public output',()=>{
  const privateRecord={...record('private','news','foreign-tenant'),title:'PRIVATE-ORGANIZATION-CLAIM'};
  const missingScope={...record('unknown'),organizationScope:undefined} as unknown as EvidenceRecord;
  const graph=buildEvidenceGraph([record('public'),privateRecord,missingScope],{now});
  expect(graph.records).toHaveLength(1);expect(JSON.stringify(graph)).not.toMatch(/PRIVATE-|foreign-tenant|rejectedScope/);
  expect(buildEvidenceGraph([record('own','news','authorized'),privateRecord],{now,organizationScope:'authorized'}).records.map(record=>record.id)).toEqual(['own']);
 });
 it('preserves undated/future/date-only source facts separately from freshness and bounds unique records',()=>{
  const input=[{...record('undated'),publishedAt:null,mode:'stale' as const},{...record('future'),publishedAt:'2027-01-01'},
   {...record('invalid'),publishedAt:'2026-02-31T12:00:00Z'},{...record('day'),publishedAt:'2026-10-20'}];
  const graph=buildEvidenceGraph(input,{now,maxRecords:4});
  expect(graph.records.map(record=>record.temporal)).toEqual(['unknown','future','unknown','dated']);
  expect(graph.records[3].publishedAt).toBe('2026-10-20');expect(graph.coverage[0]).toMatchObject({count:4,unknownDates:2,futureDates:1,stale:1,unknownFreshness:3});
  const bounded=buildEvidenceGraph([...input,input[0],record('extra')],{now,maxRecords:2});expect(bounded.records).toHaveLength(2);expect(bounded.truncated).toBe(3);
  for(const maxRecords of [Infinity,0,2001])expect(()=>buildEvidenceGraph([],{maxRecords})).toThrow();
 });
 it('projects records without arbitrary private fields and labels replay without renewing source dates',()=>{
  const input={...record('fixture'),mode:'fresh' as const,privateSecret:'NEVER-EXPORT'};
  const graph=buildEvidenceGraph([input],{now,replay:true});
  expect(graph.records[0]).toMatchObject({mode:'replay',publishedAt:'2026-10-21T00:00:00Z'});expect(graph.coverage[0].replay).toBe(1);
  expect(JSON.stringify(graph)).not.toContain('NEVER-EXPORT');
 });
 it('requires explicit scopes for normalized events and never trusts arbitrary source-type labels',()=>{
  const normalized={externalId:'e',providerId:'unreviewed-provider',eventType:'port_notice',organizationScope:null,title:'UAE fixture',summary:'Fixture',entities:[],sources:[{url:'https://fixture.invalid/source',publishedAt:'2026-10-20'}],attributes:{dataMode:'stale'}} as unknown as NormalizedIntelligenceEvent;
  const adapted=normalizedEvidence([normalized,{...normalized,organizationScope:'private'}]);expect(adapted).toHaveLength(1);
  const graph=buildEvidenceGraph(adapted,{now});expect(graph.records[0].trust.configuredBy).toBe('unreviewed');expect(graph.records[0].mode).toBe('stale');
 });
 it('keeps original seismic/fire times unknown where absent and rejects unsafe evidence links',()=>{
  expect(quakeEvidence([{id:'q',place:'UAE',time:0,url:'javascript:alert(1)'}])[0]).toMatchObject({publishedAt:'1970-01-01T00:00:00.000Z',url:'',mode:'unknown'});
  const fires=fireEvidence([{lat:0,lng:0},{lat:0,lng:0,date:'2026-02-31',time:'1200'},{lat:0,lng:0,date:'2026-10-21',time:'0000'}]);
  expect(fires.map(record=>record.publishedAt)).toEqual([null,null,'2026-10-21T00:00:00Z']);
  expect(newsEvidence([])).toEqual([]);
  expect(evidenceSourceUrl('http://fixture.invalid/source#section')).toBe('http://fixture.invalid/source#section');
  for(const value of ['https://user:secret@fixture.invalid/source','https://fixture.invalid/source?api_key=private'])expect(evidenceSourceUrl(value)).toBe('');
 });
});
