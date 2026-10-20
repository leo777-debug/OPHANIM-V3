'use client';
import { useEffect } from 'react';
import type * as maplibregl from 'maplibre-gl';
import type { ProviderMapLayer } from '@/lib/providers/types';
import { bindProviderLayers } from '@/lib/map/provider-layer-binding';

interface DynamicProviderLayersProps {
  map: maplibregl.Map | null;
  layers: ProviderMapLayer[];
  onEntityClick?: (entity: Record<string, unknown>) => void;
}
export default function DynamicProviderLayers({ map, layers, onEntityClick }: DynamicProviderLayersProps) {
  useEffect(() => {
    if (!map) return;
    return bindProviderLayers(map, layers, onEntityClick);
  }, [map, layers, onEntityClick]);
  return null;
}
