import { describe, expect, it, vi } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
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
    easeTo: vi.fn(),
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
  it('sends ten thousand original points to one worker source and uses three draw layers', () => {
    const dense = layer(); dense.source.features = Array.from({ length: 10000 }, (_, index) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [index % 360 - 180, index % 160 - 80] }, properties: { id: `fixture-${index}` } }));
    const map = fakeMap(true), cleanup = bindProviderLayers(map as unknown as maplibregl.Map, [dense]);
    expect(map.addSource).toHaveBeenCalledTimes(1); expect(map.layers.size).toBe(3);
    expect(map.sources.get('provider-source-point')).toMatchObject({ cluster: true, clusterRadius: 48, clusterMaxZoom: 14 });
    expect((map.sources.get('provider-source-point') as { data: unknown }).data).toBe(dense.source);
    expect(map.addLayer.mock.calls[0][0]).toMatchObject({ filter: ['!', ['has', 'point_count']] });
    map.layers.clear(); map.sources.clear(); map.emit('style.load'); expect(map.layers.size).toBe(3);
    expect(map.listeners.get('click:provider-layer-point-cluster')?.size).toBe(1);
    cleanup(); expect(map.layers.size).toBe(0); expect(map.sources.size).toBe(0);
  });
  it('expands a cluster but does not move the map from a worker response after disposal', async () => {
    const dense = layer(); dense.source.features = Array.from({ length: 100 }, () => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }));
    const map = fakeMap(true), cleanup = bindProviderLayers(map as unknown as maplibregl.Map, [dense]);
    const source = map.sources.get('provider-source-point') as { getClusterExpansionZoom: ReturnType<typeof vi.fn> };
    source.getClusterExpansionZoom = vi.fn().mockResolvedValue(8);
    const event = { features: [{ properties: { cluster_id: 4 }, geometry: { type: 'Point', coordinates: [0, 0] } }] };
    map.emit('click:provider-layer-point-cluster', event); await Promise.resolve(); expect(map.easeTo).toHaveBeenCalledExactlyOnceWith({ center: [0, 0], zoom: 8, duration: 350 });
    let answer!: (zoom: number) => void; source.getClusterExpansionZoom.mockImplementation(() => new Promise<number>(resolve => { answer = resolve; }));
    map.emit('click:provider-layer-point-cluster', event); cleanup(); answer(12); await Promise.resolve(); expect(map.easeTo).toHaveBeenCalledTimes(1);
  });
});
