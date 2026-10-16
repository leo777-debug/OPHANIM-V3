import type { ProviderMapFeature } from '@/lib/providers/types';
import type { NewsItem } from '@/lib/intelligence/news';
import { safeSourceUrl } from '@/lib/intelligence/news';
import type { FeedId, PublicFeed } from './types';

export const PRESENTATION_FEEDS: Record<FeedId, { name: string; color: string; source: string; url: string; reference?: boolean }> = {
  flights: { name:'Aircraft',color:'#75baff',source:'ADS-B / configured aviation sources',url:'https://adsb.lol/' },
  maritime: { name:'Vessels',color:'#40dbb0',source:'Digitraffic / AISStream public positions',url:'https://www.digitraffic.fi/en/marine-traffic/' },
  earthquakes: { name:'Earthquakes',color:'#ffbc70',source:'USGS',url:'https://earthquake.usgs.gov/' },
  fires: { name:'Fires & volcanoes',color:'#ff747e',source:'NASA FIRMS / EONET',url:'https://firms.modaps.eosdis.nasa.gov/' },
  weather: { name:'Weather & disasters',color:'#89aaff',source:'NASA EONET / NOAA / GDACS',url:'https://www.gdacs.org/' },
  satellites: { name:'Satellites',color:'#b5a4f5',source:'Public orbital elements; calculated positions',url:'https://celestrak.org/' },
  cables: { name:'Subsea cables',color:'#3caec3',source:'Bundled cable reference',url:'https://www.submarinecablemap.com/',reference:true },
  incidents: { name:'Incident markers',color:'#e893b8',source:'GDACS',url:'https://www.gdacs.org/' },
  cyber: { name:'Cyber indicators',color:'#f08888',source:'Public abuse.ch indicators',url:'https://abuse.ch/' },
  news: { name:'News & intelligence',color:'#d4e2ef',source:'Ophanim public news sources',url:'https://www.bbc.com/news' },
  'space-weather': { name:'Space weather',color:'#ead37c',source:'NOAA SWPC',url:'https://www.swpc.noaa.gov/' },
};
export const feedIds = Object.keys(PRESENTATION_FEEDS) as FeedId[];
export const isFeedId = (value: string): value is FeedId => Object.hasOwn(PRESENTATION_FEEDS,value);
const record = (value: unknown): Record<string,unknown> => value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value.slice(0,5000) : [];
const text = (value: unknown, fallback='') => typeof value==='string' ? value.slice(0,600) : typeof value==='number' && Number.isFinite(value) ? String(value) : fallback;
export function publicTime(value: unknown): string | null {
  if (typeof value!=='string' && typeof value!=='number') return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time>0 ? new Date(time).toISOString() : null;
}
export function publicUrl(value: unknown): string {
  const safe=safeSourceUrl(value);
  if (!safe) return '';
  const url=new URL(safe);
  if (url.username || url.password || [...url.searchParams.keys()].some(key=>/key|token|secret|password|auth/i.test(key))) return '';
  return safe;
}
export function normalizePublicFeed(id: FeedId, raw: unknown, fetchedAt = new Date().toISOString()): PublicFeed {
  const data=record(raw), definition=PRESENTATION_FEEDS[id];
  if (data.error) throw new Error('Public source unavailable.');
  const result:PublicFeed={id,features:[],news:[],sources:[],source:definition.source,sourceUrl:definition.url,fetchedAt,observedAt:null,reference:Boolean(definition.reference),note:''};
  if (id==='news') {
    result.news=list(data.news).map((value,index):NewsItem=>{
      const item=record(value), coords=list(item.coords);
      return {id:text(item.id,`news-${index}`),title:text(item.title,'Untitled source item'),description:text(item.description),link:publicUrl(item.link),published:publicTime(item.published),source:text(item.source,'Public source'),risk_score:typeof item.risk_score==='number' && Number.isFinite(item.risk_score)?item.risk_score:0,coords:coords.length===2 && coords.every(v=>typeof v==='number' && Number.isFinite(v)) ? coords as [number,number]:null,coords_default:true};
    });
    result.sources=list(data.news_sources).map(value=>{
      const source=record(value);
      return {name:text(source.name,'Public source'),url:publicUrl(source.url),status:source.status==='ok'?'ok':source.status==='empty'?'empty':'unavailable',count:typeof source.count==='number' && Number.isFinite(source.count)?source.count:0,checkedAt:publicTime(source.checkedAt)??fetchedAt,latestPublished:publicTime(source.latestPublished)};
    });
    if (!result.news.length && result.sources.length && result.sources.every(source=>source.status==='unavailable')) throw new Error('News sources unavailable.');
    result.observedAt=result.news.map(item=>item.published).filter((value):value is string=>Boolean(value)).sort().at(-1)??null;
    return result;
  }
  if (id==='space-weather') {
    result.observedAt=publicTime(data.kp_timestamp);
    if (typeof data.kp_index!=='number' || !Number.isFinite(data.kp_index) || !result.observedAt) throw new Error('No current geomagnetic observation.');
    result.note=`Kp ${data.kp_index} / ${text(data.storm_level,'Observation available')}`;
    return result;
  }
  const rows=id==='flights' ? ['commercial_flights','private_flights','private_jets','military_flights'].flatMap(key=>list(data[key]))
    : id==='maritime' ? list(data.ships) : id==='earthquakes' ? list(data.earthquakes) : id==='fires' ? list(data.fires)
    : id==='weather' ? list(data.events ?? data.weather) : id==='satellites' ? list(data.satellites)
    : id==='incidents' ? list(data.events) : id==='cyber' ? list(data.threats) : list(data.features);
  for (const [index,value] of rows.slice(0,5000).entries()) {
    const item=record(value), originalProperties=record(item.properties);
    if (item.organization_id || item.organizationId || item.tenant_id || item.tenantId) continue;
    // A globally configured customer/contract feed is not permission to publish
    // that customer's positions to anonymous presentation visitors.
    if (id==='maritime' && /customer|marine.?traffic/i.test(String(item.source ?? ''))) continue;
    if (id==='cables') {
      const geometry=record(item.geometry);
      if (!['LineString','MultiLineString'].includes(String(geometry.type))) continue;
      result.features.push({type:'Feature',geometry:geometry as unknown as ProviderMapFeature['geometry'],properties:{id:text(originalProperties.id,`cable-${index}`),name:text(originalProperties.name,'Subsea cable'),source:definition.source,sourceUrl:definition.url,reference:true}});
      continue;
    }
    const lat=Number(item.lat ?? item.latitude),lng=Number(item.lng ?? item.lon ?? item.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180 || item.lat===null || item.lng===null) continue;
    // Legacy aviation/AIS adapters stamp `timestamp` at fetch/receipt time.
    // Do not relabel that timestamp as the source's position observation time.
    const observedAt=publicTime(item.observedAt ?? (id==='flights'||id==='maritime' ? undefined : item.timestamp ?? item.time ?? item.date ?? item.updated_at));
    const name=text(item.name ?? item.callsign ?? item.title ?? item.place ?? item.malware ?? item.id,`${definition.name} ${index+1}`);
    const properties:Record<string,unknown>={id:text(item.id ?? item.icao24 ?? item.mmsi,`${id}-${index}`),name,type:text(item.type,id),source:text(item.source,definition.source),sourceUrl:publicUrl(item.url ?? item.reference) || definition.url,observedAt,lat,lng};
    for (const key of ['mmsi','imo','registration','icao24','model','heading','speed','speed_knots','alt','magnitude','depth','severity','country','destination']) {
      if (typeof item[key]==='string') properties[key]=text(item[key]);
      else if (typeof item[key]==='number' && Number.isFinite(item[key])) properties[key]=item[key];
    }
    result.features.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties});
  }
  result.observedAt=result.features.map(feature=>feature.properties?.observedAt).filter((value):value is string=>typeof value==='string').sort().at(-1)??null;
  if (id==='satellites') result.note='Calculated from public orbital elements; not live satellite telemetry.';
  if ((id==='flights'||id==='maritime') && !result.features.length) throw new Error('No current positions received.');
  return result;
}
