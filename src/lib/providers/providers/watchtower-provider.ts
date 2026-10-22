import { searchCameraPorts, cameraCatalogue,effectiveCamera } from '@/lib/watchtower/catalogue';
import type { Provider } from '../types';
export const watchtowerProvider:Provider={
 metadata:{id:'watchtower',name:'Watchtower public cameras',description:'Auditable public waterfront cameras; missing feeds are coverage gaps.',
  category:'camera',supportedEntityTypes:['port','location'],supportedIntents:['port_lookup','forward_geocode'],supportsMapLayers:true,
  requiresCredentials:false,enabled:true,timeoutMs:2000,priority:12,rateLimitPerMinute:30,
  geographicCoverage:'Gulf priority ports; best effort',freshness:'Catalogue with separately checked health',license:'Per-feed terms; no re-streaming',commercialUse:'review_required'},
 async execute(query){return searchCameraPorts(query.query??'');},
 normalize(raw){return (raw as ReturnType<typeof searchCameraPorts>).map(p=>({id:`watchtower:${p.code}`,label:`${p.name} cameras (${p.cameras.length})`,lat:p.lat,lng:p.lon,type:'port',category:'camera',importance:.5,zoomLevel:10,provider:'watchtower',summary:p.gap,action:{type:'open_entity',href:`/logistics/map?tool=watchtower&port=${p.code}`}}));},
 async createMapLayers(){return [{id:'watchtower-cameras',provider:'watchtower',name:'Public camera catalogue (not guaranteed live)',geometry:'point',visible:true,interactive:true,style:{color:'#f8bc59',radius:6},source:{type:'FeatureCollection',features:cameraCatalogue.map(c=>effectiveCamera(c)).map(c=>({type:'Feature',geometry:{type:'Point',coordinates:[c.lon,c.lat]},properties:{...c,lng:c.lon,provider:'watchtower'}}))}}];}
};
