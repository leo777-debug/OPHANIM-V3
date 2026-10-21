import type { ProviderMapFeature } from '@/lib/providers/types';
import type { NewsItem } from '@/lib/intelligence/news';
import { safeSourceUrl } from '@/lib/intelligence/news';
import type { FeedId, PublicFeed } from './types';

export const PRESENTATION_FEEDS: Record<FeedId, { name: string; color: string; source: string; url: string; reference?: boolean }> = {
  flights: { name:'Aircraft',color:'#75baff',source:'ADS-B / configured aviation sources',url:'https://adsb.lol/' },
  maritime: { name:'Vessels',color:'#40dbb0',source:'Digitraffic Marine AIS (regional)',url:'https://www.digitraffic.fi/en/marine-traffic/' },
  ports: { name:'Ports & harbours',color:'#26a69a',source:'Ophanim port reference',url:'https://www.digitraffic.fi/en/marine-traffic/',reference:true },
  chokepoints: { name:'Maritime chokepoints',color:'#ff9500',source:'Ophanim chokepoint reference',url:'https://www.digitraffic.fi/en/marine-traffic/',reference:true },
  cameras: { name:'Public cameras',color:'#00e676',source:'Existing public transport camera directories',url:'https://tfl.gov.uk/' },
  broadcasts: { name:'News broadcast locations',color:'#ff608b',source:'Ophanim broadcaster directory',url:'https://www.youtube.com/',reference:true },
  conflicts: { name:'Conflict region markers',color:'#d32f2f',source:'Ophanim curated region reference',url:'https://liveuamap.com/',reference:true },
  infrastructure: { name:'Infrastructure locations',color:'#ead37c',source:'Ophanim infrastructure reference',url:'https://pris.iaea.org/',reference:true },
  'war-sanctions': { name:'War & Sanctions ports',color:'#ff4d6d',source:'GUR War & Sanctions',url:'https://war-sanctions.gur.gov.ua/en/',reference:true },
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
export const publicFeedLimit = (id: FeedId) => id==='cameras'?40000:id==='flights'||id==='maritime'?30000:5000;
const text = (value: unknown, fallback='') => typeof value==='string' ? value.slice(0,600) : typeof value==='number' && Number.isFinite(value) ? String(value) : fallback;
export function publicTime(value: unknown): string | null {
  if (typeof value!=='string' && typeof value!=='number') return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time>0 ? new Date(time).toISOString() : null;
}
function fireObservationTime(item: Record<string, unknown>): string | null {
  if (item.observedAt != null || item.timestamp != null) return publicTime(item.observedAt ?? item.timestamp);
  if (typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return null;
  const clock = String(item.time ?? '').trim();
  if (!clock) return publicTime(item.date);
  if (!/^\d{1,4}$/.test(clock)) return null;
  const hhmm = clock.padStart(4, '0');
  if (Number(hhmm.slice(0, 2)) > 23 || Number(hhmm.slice(2)) > 59) return null;
  return publicTime(`${item.date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
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
  if (['maritime','ports','chokepoints'].includes(id)) result.publicOnly = data.publicOnly === true;
  if (id==='news') {
    result.news=list(data.news).map((value,index):NewsItem=>{
      const item=record(value), coords=list(item.coords);
      return {
        id:text(item.id,`news-${index}`),title:text(item.title,'Untitled source item'),description:text(item.description),
        link:publicUrl(item.link),published:publicTime(item.published),source:text(item.source,'Public source'),
        risk_score:typeof item.risk_score==='number' && Number.isFinite(item.risk_score)?item.risk_score:0,
        coords:coords.length===2 && coords.every(v=>typeof v==='number' && Number.isFinite(v)) && Math.abs(Number(coords[0]))<=90 && Math.abs(Number(coords[1]))<=180 ? coords as [number,number]:null,
        coords_default:item.coords_default!==false,
        location_precision:item.location_precision==='reported' && item.coords_default===false?'reported':'approximate',
        region:typeof item.region==='string'?text(item.region):undefined,
        first_seen:publicTime(item.first_seen)??undefined,
        first_seen_storage:['postgres','local-file','memory','no-observations'].includes(String(item.first_seen_storage))?String(item.first_seen_storage):undefined,
        first_seen_warning:item.first_seen_warning?'First observation persistence degraded; see source health.':null,
        source_data_mode:item.source_data_mode==='fresh'||item.source_data_mode==='stale'||item.source_data_mode==='unavailable'?item.source_data_mode:undefined,
        source_last_success:publicTime(item.source_last_success),source_stale_since:publicTime(item.source_stale_since),
      };
    });
    result.sources=list(data.news_sources).map(value=>{
      const source=record(value);
      return {
        name:text(source.name,'Public source'),url:publicUrl(source.url),
        status:source.status==='ok'?'ok':source.status==='empty'?'empty':'unavailable',
        count:typeof source.count==='number' && Number.isFinite(source.count)?source.count:0,
        checkedAt:publicTime(source.checkedAt)??fetchedAt,latestPublished:publicTime(source.latestPublished),
        lastSuccessAt:publicTime(source.lastSuccessAt),staleSince:publicTime(source.staleSince),
        mode:source.mode==='fresh'||source.mode==='stale'||source.mode==='unavailable'?source.mode:undefined,
        latencyMs:typeof source.latencyMs==='number' && Number.isFinite(source.latencyMs) && source.latencyMs>=0?source.latencyMs:null,
        error:source.error?'Source refresh failed; retained evidence may be stale.':null,
        refresh:typeof source.refresh==='string'?text(source.refresh):undefined,
      };
    });
    if (!result.news.length && result.sources.length && result.sources.every(source=>source.status==='unavailable')) throw new Error('News sources unavailable.');
    result.observedAt=result.news.map(item=>item.published).filter((value):value is string=>Boolean(value)).sort().at(-1)??null;
    result.features=result.news.flatMap(item=>item.coords?[{type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[item.coords[1],item.coords[0]]},properties:{id:item.id,name:item.title,lat:item.coords[0],lng:item.coords[1],source:item.source,sourceUrl:item.link,observedAt:item.published,approximate_location:item.location_precision!=='reported'}}]:[]);
    result.note='News markers are story-associated locations, not verified incident coordinates.';
    return result;
  }
  if (id==='space-weather') {
    result.observedAt=publicTime(data.kp_timestamp);
    if (typeof data.kp_index!=='number' || !Number.isFinite(data.kp_index) || !result.observedAt) throw new Error('No current geomagnetic observation.');
    result.note=`Kp ${data.kp_index} / ${text(data.storm_level,'Observation available')}`;
    return result;
  }
  const bounded = (value:unknown):unknown[] => Array.isArray(value)?value.slice(0,publicFeedLimit(id)):[];
  const rows=id==='flights' ? ['commercial_flights','private_flights','private_jets','military_flights'].flatMap((key,index)=>bounded(data[key]).map(value=>({...record(value),aircraft_category:['commercial','private','jet','military'][index]})))
    : id==='maritime' ? bounded(data.ships) : id==='ports' ? list(data.ports) : id==='chokepoints' ? list(data.chokepoints)
    : id==='cameras' ? bounded(data.cameras) : id==='broadcasts' ? list(data.feeds) : id==='conflicts' ? list(data.zones)
    : id==='infrastructure' ? list(data.infrastructure) : id==='war-sanctions' ? list(data.points)
    : id==='earthquakes' ? list(data.earthquakes) : id==='fires' ? list(data.fires)
    : id==='weather' ? list(data.events ?? data.weather) : id==='satellites' ? list(data.satellites)
    : id==='incidents' ? list(data.events) : id==='cyber' ? list(data.threats) : list(data.features);
  for (const [index,value] of rows.slice(0,publicFeedLimit(id)).entries()) {
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
    const observedAt=definition.reference?null:id==='fires'?fireObservationTime(item):publicTime(item.observedAt ?? (id==='flights'||id==='maritime'||id==='cameras' ? undefined : item.timestamp ?? item.time ?? item.date ?? item.updated_at));
    const name=text(item.name ?? item.label ?? item.callsign ?? item.title ?? item.place ?? item.malware ?? item.id,`${definition.name} ${index+1}`);
    const properties:Record<string,unknown>={id:text(item.id ?? item.icao24 ?? item.mmsi,`${id}-${index}`),name,type:text(item.type,id),source:text(item.source,definition.source),sourceUrl:publicUrl(item.sourceUrl ?? item.external_url ?? item.url ?? item.reference ?? item.feed_url) || definition.url,observedAt,lat,lng,reference:result.reference};
    for (const key of ['mmsi','imo','registration','icao24','model','callsign','category','aircraft_category','heading','speed','speed_knots','alt','magnitude','depth','severity','country','city','destination','color','noradId','mission','brightness','ip','malware','status','threat_type','operational_category','vessel','classification','port']) {
      if (typeof item[key]==='string') properties[key]=text(item[key]);
      else if (typeof item[key]==='number' && Number.isFinite(item[key])) properties[key]=item[key];
    }
    result.features.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties});
  }
  result.observedAt=result.features.map(feature=>feature.properties?.observedAt).filter((value):value is string=>typeof value==='string').sort().at(-1)??null;
  if (id==='satellites') result.note='Calculated from public orbital elements; not live satellite telemetry.';
  if (id==='cameras') result.note='Public camera locations; stream availability is checked by the original source, not guaranteed by a map marker.';
  if (id==='broadcasts') result.note='Broadcaster studio/reference locations, not verified live broadcasts or event locations.';
  if (id==='conflicts') result.note='Curated regional anchors, not verified current frontlines or pinpoint incident locations. Unverified RSS coordinate offsets are not plotted.';
  if (id==='ports'||id==='chokepoints') result.note='Reference locations, not live congestion measurements or AIS positions.';
  if (id==='war-sanctions') result.note='Source-listed vessel-associated ports, not current vessel positions.';
  if (['flights','maritime','cameras'].includes(id) && !result.features.length) throw new Error('No current positions received.');
  return result;
}
