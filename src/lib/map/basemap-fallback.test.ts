import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Map, StyleSpecification } from 'maplibre-gl';
import { bindBasemapFallback } from './basemap-fallback';
const style:StyleSpecification={version:8,sources:{},layers:[]};
function renderer() {
  const events=new globalThis.Map<string,()=>void>();
  const map={setStyle:vi.fn(),on:vi.fn((name:string,callback:()=>void)=>events.set(name,callback)),
    once:vi.fn((name:string,callback:()=>void)=>events.set(name,callback)),
    off:vi.fn((name:string)=>events.delete(name))};
  return {map:map as unknown as Map,setStyle:map.setStyle,emit:(name:string)=>events.get(name)?.()};
}
describe('initial basemap outage fallback',()=>{
  afterEach(()=>vi.useRealTimers());
  it('recovers from an initial remote error exactly once',()=>{
    vi.useFakeTimers();const r=renderer(),notify=vi.fn();
    bindBasemapFallback(r.map,style,notify);
    r.emit('error');r.emit('error');vi.advanceTimersByTime(5000);
    expect(r.setStyle).toHaveBeenCalledExactlyOnceWith(style);expect(notify).toHaveBeenCalledTimes(1);
  });
  it('bounds an initial style that never finishes',()=>{
    vi.useFakeTimers();const r=renderer();
    bindBasemapFallback(r.map,style,()=>{});
    vi.advanceTimersByTime(3999);expect(r.setStyle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);expect(r.setStyle).toHaveBeenCalledTimes(1);
  });
  it('never resets a loaded operational map or an unmounted renderer',()=>{
    vi.useFakeTimers();const r=renderer();
    bindBasemapFallback(r.map,style,()=>{});r.emit('load');r.emit('error');vi.advanceTimersByTime(5000);
    expect(r.setStyle).not.toHaveBeenCalled();
    const next=renderer(),dispose=bindBasemapFallback(next.map,style,()=>{});dispose();vi.advanceTimersByTime(5000);
    expect(next.setStyle).not.toHaveBeenCalled();
  });
});
