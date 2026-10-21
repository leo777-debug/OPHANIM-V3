import {describe,it,expect} from 'vitest';
import {demurrageExposure} from './demurrage';
describe('Demurrage scenarios',()=>{
 it('prices positive billed days only, from explicit tariff and original promise',()=>{
  const result=demurrageExposure([...Array.from({length:5},()=>({delay_hours:0})),...Array.from({length:5},()=>({delay_hours:48}))],'2026-11-01T00:00:00Z','2026-11-02T00:00:00Z',100);
  expect(result?.probability).toBe(.5);expect(result?.expectedAed).toBe(50);expect(result?.p90).toBe(100);
 });
 it('withholds when history or tariff is missing',()=>{
  expect(demurrageExposure([],'2026-11-01','2026-11-02',100)).toBeNull();
  expect(demurrageExposure(Array.from({length:10},()=>({delay_hours:1})),'invalid','2026-11-02',100)).toBeNull();
 });
});
