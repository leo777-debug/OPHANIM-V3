import type { Provider, SearchAction } from '../types';

const actions: Record<string, { label: string; summary: string; action: SearchAction }> = {
  show_submarine_cables: {
    label: 'Submarine cables', summary: 'Enable the existing undersea cable layer.',
    action: { type: 'enable_layers', layers: ['cables'] },
  },
  show_ghost_ships: {
    label: 'Ghost ships', summary: 'Enable GUR-designated Shadow Fleet associated-port markers.',
    action: { type: 'enable_layers', layers: ['war_sanctions'] },
  },
  show_sanctioned_vessels: {
    label: 'Sanctioned vessels', summary: 'Enable GUR War & Sanctions associated-port markers.',
    action: { type: 'enable_layers', layers: ['war_sanctions'] },
  },
  show_ai_data_centers: {
    label: 'AI data centers', summary: 'No enabled data-center provider or map layer is configured.',
    action: { type: 'unavailable', message: 'AI data-center data has not been configured.' },
  },
  unsupported_natural_language: {
    label: 'Unsupported command', summary: 'No deterministic command rule or enabled provider matched this request.',
    action: { type: 'unavailable', message: 'Use a supported entity type or map command.' },
  },
};

export const mapCommandProvider: Provider = {
  metadata: {
    name: 'map-command', description: 'Deterministic map-layer command handler.',
    supportedEntityTypes: ['command'], supportedIntents: ['map_command', 'natural_language'], supportsMapLayers: true,
    requiresCredentials: false, timeoutMs: 100, enabled: true, priority: 10,
  },
  async createMapLayers() { return []; },
  async execute(query) { return actions[query.command ?? 'unsupported_natural_language']; },
  normalize(raw) {
    const value = raw as { label: string; summary: string; action: SearchAction };
    return [{ id: `command:${value.label}`, label: value.label, type: 'command', category: 'map', importance: 1, zoomLevel: 0, provider: 'map-command', summary: value.summary, action: value.action }];
  },
};
