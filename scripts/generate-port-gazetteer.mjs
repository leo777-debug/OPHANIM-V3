// Derive conservative aliases from the already licensed/pinned bundled reference.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MARITIME_NETWORK} from '../src/lib/route-intelligence/reference.ts';
const bytes=readFileSync('public/reference/ports.geojson');
const sha256=createHash('sha256').update(bytes).digest('hex');
if(sha256!==MARITIME_NETWORK.portsSha256)throw new Error('Port source hash differs from the reviewed reference.');
const collection=JSON.parse(bytes.toString('utf8'));
const fold=value=>value.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const byId=new Map();
for(const feature of collection.features){
 const name=String(feature.properties?.name??'').trim(),code=String(feature.properties?.port??'').toUpperCase().trim();
 if(!name||name.length>160)continue;
 const validCode=/^[A-Z]{2}[A-Z0-9]{3}$/.test(code);
 const id=`port:marnet:${validCode?code:createHash('sha256').update(JSON.stringify([name,feature.properties?.cty,feature.geometry?.coordinates])).digest('hex').slice(0,20)}`;
 const record=byId.get(id)??{id,label:name,aliases:[],type:'port'};
 record.aliases.push(`Port of ${name}`,`${name} port`,`ميناء ${name}`,...validCode?[`port code ${code}`,`port ${code}`]:[]);
 byId.set(id,record);
}
const owners=new Map();
for(const entry of byId.values())for(const alias of entry.aliases){const key=fold(alias),ids=owners.get(key)??new Set();ids.add(entry.id);owners.set(key,ids);}
let withheldAliases=0;
for(const entry of byId.values())entry.aliases=[...new Set(entry.aliases)].filter(alias=>{const unique=owners.get(fold(alias)).size===1;if(!unique)withheldAliases++;return unique;});
const entries=[...byId.values()].filter(entry=>entry.aliases.length).sort((a,b)=>a.id.localeCompare(b.id));
const metadata={id:'marnet-port-mentions',name:'Conservative Marnet port-mention dictionary',version:MARITIME_NETWORK.version,
 source:MARITIME_NETWORK.source,sourceSha256:sha256,sourceDatasetDate:MARITIME_NETWORK.datasetDate,
 dateMeaning:'Pinned reference dataset date; not an event observation or current port operating status',
 licence:MARITIME_NETWORK.licence,commercialUse:'yes',attribution:MARITIME_NETWORK.attribution,
 termsUrl:'https://www.apache.org/licenses/LICENSE-2.0',rateLimits:'Packaged reference; no upstream requests',keyNeeded:false,
 sourceRecordCount:collection.features.length,entryCount:entries.length,withheldAliases,
 method:'Explicit port phrases or marked reference codes only; ambiguous aliases withheld. No event coordinates inferred.'};
writeFileSync('src/lib/intelligence/port-gazetteer-metadata.json',JSON.stringify(metadata,null,2)+'\n');
writeFileSync('src/lib/intelligence/port-gazetteer.json',JSON.stringify({metadata,entries})+'\n');
console.log(JSON.stringify({sourceRecords:metadata.sourceRecordCount,entries:entries.length,withheldAliases}));
