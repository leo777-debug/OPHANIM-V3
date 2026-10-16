import { feedIds } from './presentation/feeds';
import { parseAtlasTool } from './atlas-tools';
import { createMapWorkspace, type MapWorkspace, type MapWorkspaceSnapshot } from './map-workspaces';

export const UNIFIED_MAP_STORAGE = 'ophanim-unified-map-v1';
export interface UnifiedMapState { version: 1; activeId: string; workspaces: MapWorkspace[] }
export const defaultMapWorkspace = (): MapWorkspace => createMapWorkspace({ id:'main',label:'Global',activeLayers:Object.fromEntries(feedIds.map(id=>[id,true])),projection:'globe',mapStyle:'dark',viewport:{latitude:24,longitude:42,zoom:1.35} });
export const defaultUnifiedMapState = (): UnifiedMapState => ({version:1,activeId:'main',workspaces:[defaultMapWorkspace()]});
export function restoreUnifiedMapState(raw: string | null): UnifiedMapState {
  try {
    const value: unknown=JSON.parse(raw ?? 'null');
    if (!value || typeof value!=='object') return defaultUnifiedMapState();
    const stored=value as Partial<UnifiedMapState>;
    if (stored.version!==1 || !Array.isArray(stored.workspaces) || !stored.workspaces.length || stored.workspaces.length>12) return defaultUnifiedMapState();
    const ids=new Set<string>();
    const workspaces=stored.workspaces.map(item=>{
      if (!item || typeof item.id!=='string' || item.id.length>80 || ids.has(item.id) || typeof item.label!=='string' || item.label.length>80 || !['globe','mercator'].includes(item.projection) || !['dark','earth','satellite'].includes(item.mapStyle)) throw new Error('Invalid workspace');
      const view=item.viewport;
      if (!view || ![view.latitude,view.longitude,view.zoom].every(Number.isFinite) || Math.abs(view.latitude)>85 || Math.abs(view.longitude)>180 || view.zoom<0 || view.zoom>22) throw new Error('Invalid viewport');
      ids.add(item.id);
      const base=defaultMapWorkspace();
      return createMapWorkspace({...base,id:item.id,label:item.label,projection:item.projection,mapStyle:item.mapStyle,viewport:view,activeLayers:Object.fromEntries(feedIds.map(id=>[id,typeof item.activeLayers?.[id]==='boolean'?item.activeLayers[id]:true]))});
    });
    if (!ids.has('main')) return defaultUnifiedMapState();
    return {version:1,activeId:typeof stored.activeId==='string' && ids.has(stored.activeId)?stored.activeId:'main',workspaces};
  } catch { return defaultUnifiedMapState(); }
}
export function patchUnifiedWorkspace(state:UnifiedMapState,patch:Partial<MapWorkspaceSnapshot>):UnifiedMapState {
  return {...state,workspaces:state.workspaces.map(item=>item.id===state.activeId?{...item,...patch}:item)};
}
export function legacyAtlasDestination(query:Record<string,string|string[]|undefined>):string {
  const params=new URLSearchParams();
  for(const key of ['view','tool','layers','lat','lng','lon','zoom']) {
    const value=query[key];
    if(typeof value!=='string' || value.length>1200)continue;
    if(key==='tool' && !parseAtlasTool(value))continue;
    if(key==='view' && value!=='full' && value!=='map')continue;
    params.set(key,value);
  }
  return '/logistics/map'+(params.size?'?'+params.toString():'');
}
