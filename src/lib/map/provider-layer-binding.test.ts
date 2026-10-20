import { describe, expect, it, vi } from 'vitest';
import type maplibregl from 'maplibre-gl';
import type { ProviderMapLayer } from '@/lib/providers/types';
import { bindProviderLayers } from './provider-layer-binding';
function fakeMap(initiallyReady: boolean) {
  const listeners = new Map<string, Set<(event?: unknown) => void>>(), sources = new Map<string, unknown>(), layers = new Map<string, { id: string; type: string }>();
  const map = {
    ready: initiallyReady, sources, layers, listeners, isStyleLoaded: () => map.ready,
    getSource: (id: string) => sources.get(id), getLayer: (id: string) => layers.get(id),
    addSource: vi.fn((id: string, source: unknown) => { sources.set(id, source); map.emit('styledata'); }),
    removeSource: (id: string) => { sources.delete(id); map.emit('styledata'); },
    addLayer: vi.fn((layer: { id: string; type: string }) => { layers.set(layer.id, layer); map.emit('styledata'); }),
    removeLayer: (id: string) => { layers.delete(id); map.emit('styledata'); },
    on: (event: string, idOrHandler: string | ((event?: unknown) => void), handler?: (event?: unknown) => void) => { const key = typeof idOrHandler === 'string' ? `${event}:${idOrHandler}` : event, fn = typeof idOrHandler === 'string' ? handler! : idOrHandler; if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key)!.add(fn); },
    off: (event: string, idOrHandler: string | ((event?: unknown) => void), handler?: (event?: unknown) => void) => { const key = typeof idOrHandler === 'string' ? `${event}:${idOrHandler}` : event, fn = typeof idOrHandler === 'string' ? handler! : idOrHandler; listeners.get(key)?.delete(fn); },
    emit: (event: string, payload?: unknown) => { for (const callback of [...listeners.get(event) ?? []]) callback(payload); },
  };
  return map;
}
const layer = (geometry: ProviderMapLayer['geometry'] = 'point'): ProviderMapLayer => ({ id: geometry, provider: 'test-provider', name: 'Public test data', geometry, source: { type: 'FeatureCollection', features: [] }, style: { color: '#22d3ee' }, visible: true, interactive: true });
describe('provider layers and map style lifecycle', () => {
  it('waits for a ready style when data precedes map load and does not duplicate layers on later style events', () => {
    const map = fakeMap(false), cleanup = bindProviderLayers(map as unknown as maplibregl.Map, [layer()]);
    expect(map.addSource).not.toHaveBeenCalled();
    map.ready = true; map.emit('idle'); expect(map.addSource).toHaveBeenCalledTimes(1); expect(map.layers.has('provider-layer-point-main')).toBe(true);
    for (let index = 0; index < 20; index++) map.emit('styledata'); expect(map.addSource).toHaveBeenCalledTimes(1);
    cleanup(); expect(map.sources.size).toBe(0); expect(map.layers.size).toBe(0);
    map.emit('idle'); expect(map.addSource).toHaveBeenCalledTimes(1);
  });
  it('restores lines/polygon outlines and click handlers after style replacement without leaking old handlers', () => {
    const map = fakeMap(true), click = vi.fn(), cleanup = bindProviderLayers(map as unknown as maplibregl.Map, [layer('line'), layer('polygon')], click);
    expect(map.layers.get('provider-layer-line-main')?.type).toBe('line'); expect(map.layers.has('provider-layer-polygon-outline')).toBe(true);
    map.sources.clear(); map.layers.clear(); map.emit('style.load'); expect(map.addSource).toHaveBeenCalledTimes(4);
    expect(map.listeners.get('click:provider-layer-line-main')?.size).toBe(1);
    map.emit('click:provider-layer-line-main', { features: [{ properties: { title: 'Evidence' }, geometry: { type: 'LineString', coordinates: [] } }] });
    expect(click).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ title: 'Evidence', provider: 'test-provider' }));
    cleanup(); expect([...map.listeners.values()].every(listeners => listeners.size === 0)).toBe(true);
  });
  it('bounds invalid-layer retries and never creates hidden layers', () => {
    const map = fakeMap(true); map.addSource.mockImplementation(() => { throw new Error('Invalid descriptor'); });
    const cleanup = bindProviderLayers(map as unknown as maplibregl.Map, [layer()]);
    for (let index = 0; index < 10; index++) map.emit('idle'); expect(map.addSource).toHaveBeenCalledTimes(3); cleanup();
    const hidden = fakeMap(true), clear = bindProviderLayers(hidden as unknown as maplibregl.Map, [{ ...layer(), visible: false }]);
    hidden.emit('idle'); expect(hidden.addSource).not.toHaveBeenCalled(); clear();
  });
});
