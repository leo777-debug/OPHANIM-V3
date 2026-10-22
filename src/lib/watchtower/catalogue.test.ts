import {describe,it,expect} from 'vitest';
import {cameraCatalogue,effectiveCamera,playable,canOpenCamera,searchCameraPorts} from './catalogue';
describe('reviewed public camera playback and staleness',()=>{
 it('has a real reviewed publisher embed without assigning it to a priority cargo port',()=>{
  const camera=cameraCatalogue.find(c=>c.id==='muscat-aida-darglobal')!;
  expect(searchCameraPorts('Yiti')[0].code).toBe('OMMNQ');
  expect(camera.coverage).toContain('NOT Mina Qaboos cargo berths');
  expect(camera.healthCheckAllowed).toBe(false);
  expect(canOpenCamera(camera)).toBe(true);
 });
 it('demotes old playback verification while allowing explicit inspection of the reviewed player',()=>{
  const camera=cameraCatalogue.find(c=>c.id==='muscat-aida-darglobal')!;
  const stale=effectiveCamera(camera,undefined,Date.parse(camera.lastSeen!)+31*60*1000);
  expect(stale.status).toBe('unverified');expect(playable(stale)).toBe(false);expect(canOpenCamera(stale)).toBe(true);
  expect(playable({...camera,lastSeen:'2020-01-01T00:00:00Z'})).toBe(false);
  expect(canOpenCamera({...stale,embedAllowed:false})).toBe(false);
  expect(canOpenCamera({...stale,status:'offline'})).toBe(false);
 });
});
