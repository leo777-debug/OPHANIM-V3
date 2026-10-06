export type MapProjection = 'globe' | 'mercator';
export type MapStyle = 'dark' | 'earth' | 'satellite';

export type MapViewport = {
  latitude: number;
  longitude: number;
  zoom: number;
};

export type MapWorkspaceTarget = {
  type: string;
  value: string;
};

export type MapWorkspace = {
  id: string;
  label: string;
  target?: MapWorkspaceTarget;
  activeLayers: Record<string, boolean>;
  projection: MapProjection;
  mapStyle: MapStyle;
  viewport: MapViewport;
};

export type MapWorkspaceSnapshot = Pick<MapWorkspace, 'activeLayers' | 'projection' | 'mapStyle' | 'viewport'>;

export function createMapWorkspace(input: {
  id: string;
  label: string;
  activeLayers: Record<string, boolean>;
  projection: MapProjection;
  mapStyle: MapStyle;
  viewport: MapViewport;
  target?: MapWorkspaceTarget;
}): MapWorkspace {
  return {
    ...input,
    activeLayers: { ...input.activeLayers },
    viewport: { ...input.viewport },
  };
}

export function updateMapWorkspace(
  workspaces: MapWorkspace[],
  id: string,
  snapshot: Partial<MapWorkspaceSnapshot>,
): MapWorkspace[] {
  return workspaces.map((workspace) => (
    workspace.id === id
      ? {
          ...workspace,
          ...snapshot,
          activeLayers: snapshot.activeLayers ? { ...snapshot.activeLayers } : workspace.activeLayers,
          viewport: snapshot.viewport ? { ...snapshot.viewport } : workspace.viewport,
        }
      : workspace
  ));
}

export function closeMapWorkspace(workspaces: MapWorkspace[], id: string): MapWorkspace[] {
  return workspaces.filter((workspace) => workspace.id !== id);
}
