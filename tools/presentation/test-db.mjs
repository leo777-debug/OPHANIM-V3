import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFile,readdir } from 'node:fs/promises';
import { createHash,randomBytes,scryptSync } from 'node:crypto';

export async function startTestDatabase(port=55439) {
  const db=new PGlite({extensions:{pgcrypto}});
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    create table public.ophanim_schema_migrations(name text primary key,checksum text not null,applied_at timestamptz default now());`);
  const files=[];
  for(const directory of ['db/migrations','supabase/migrations'])for(const name of await readdir(directory))if(name.endsWith('.sql'))files.push({name,directory});
  for(const file of files.sort((a,b)=>a.name.localeCompare(b.name))) {
    try{await db.exec(await readFile(`${file.directory}/${file.name}`,'utf8'));}catch(error){throw new Error(`Migration failed: ${file.name}: ${error.message}`);}
  }
  const organizationId='10000000-0000-4000-8000-000000000001';
  await db.query("insert into ophanim_organizations(id,name,slug) values($1,'SYNTHETIC PRESENTATION TEST ONLY','presentation-test')",[organizationId]);
  const sessions={},credentials={};
  for(const [index,role] of ['owner','viewer','analyst'].entries()) {
    const id=`20000000-0000-4000-8000-00000000000${index+1}`,token=randomBytes(32).toString('base64url'),salt=randomBytes(16).toString('base64');
    const password=randomBytes(18).toString('base64url');
    const hash=`scrypt$${salt}$${scryptSync(password,Buffer.from(salt,'base64'),64).toString('base64')}`;
    await db.query('insert into ophanim_users(id,email,display_name,password_hash) values($1,$2,$3,$4)',[id,`${role}@presentation.invalid`,`Test ${role}`,hash]);
    await db.query('insert into ophanim_organization_memberships(organization_id,user_id,role) values($1,$2,$3)',[organizationId,id,role]);
    await db.query("insert into ophanim_sessions(user_id,organization_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 day')",[id,organizationId,createHash('sha256').update(token).digest('hex')]);
    sessions[role]=token;
    credentials[role]={email:`${role}@presentation.invalid`,password,organizationSlug:'presentation-test'};
  }
  const server=new PGLiteSocketServer({db,host:'127.0.0.1',port,maxConnections:30});
  await server.start();
  return {db,sessions,credentials,url:`postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,stop:async()=>{await server.stop();await db.close();}};
}

export async function seedReplay(db) {
  const now=new Date().toISOString();
  const common={features:[],news:[],sources:[],source:'Synthetic presentation test fixture',sourceUrl:'https://example.invalid/evidence',fetchedAt:now,observedAt:now,reference:false,note:'Synthetic fixture for tests only',testFixture:true};
  const rows={
    flights:[['TEST AIR 01',52,25],['TEST AIR 02',38,34],['TEST AIR 03',63,25]],
    maritime:[['TEST VESSEL 01',56,26],['TEST VESSEL 02',32,31],['TEST VESSEL 03',44,12]],
    earthquakes:[['TEST earthquake Oman',58,24],['TEST earthquake Turkey',36,39],['TEST earthquake Greece',23,38]],
    weather:[['TEST weather advisory',53,26]],incidents:[['TEST incident marker',40,28]],
    ports:[['TEST reference port',55,25]],chokepoints:[['TEST reference strait',56,26]],
    cameras:Array.from({length:180},(_,i)=>[`TEST CAMERA ${i}`,12+(i%18)*.24,45+Math.floor(i/18)*.18]),
    broadcasts:[['TEST broadcaster',2.28,48.83]],conflicts:[['TEST REGION',31,48]],
    infrastructure:[['TEST facility',27,43]],'war-sanctions':[['TEST vessel-associated port',37.77,44.72]],
    satellites:[['TEST calculated orbital position',46,20]],fires:[['TEST fire observation',35,20]],cyber:[['TEST indicator',28,40]],
  };
  for(const [id,items] of Object.entries(rows)) {
    const reference=['ports','chokepoints','broadcasts','conflicts','infrastructure','war-sanctions'].includes(id);
    const feed={...common,id,reference,features:items.map(([name,lng,lat],index)=>({type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{id:`${id}-${index}`,name,lat,lng,type:id==='maritime'?'cargo':id,heading:75,severity:id==='conflicts'?'war':undefined,color:id==='satellites'?'#b5a4f5':undefined,brightness:id==='fires'?320:undefined,aircraft_category:id==='flights'?'commercial':undefined,magnitude:id==='earthquakes'?4.2:undefined,source:common.source,sourceUrl:common.sourceUrl,reference,observedAt:reference?null:now}}))};
    await db.query('insert into ophanim_presentation_snapshots(feed_id,payload,item_count,recorded_at) values($1,$2,$3,$4) on conflict(feed_id) do update set payload=excluded.payload,item_count=excluded.item_count,recorded_at=excluded.recorded_at',[id,JSON.stringify(feed),items.length,now]);
  }
  const feed={...common,id:'news',news:[['Gulf','Oman port weather advisory: test replay'],['Europe','Europe cargo routes: test replay'],['Asia','Singapore terminal update: test replay']].map(([region,title],index)=>({id:`news-${index}`,title,description:'Synthetic test evidence only',source:'Synthetic test newsroom',published:now,link:'https://example.invalid/story',risk_score:0,coords:[25+index,50+index],coords_default:true,region})),sources:[]};
  await db.query("insert into ophanim_presentation_snapshots values('news',$1,3,$2) on conflict(feed_id) do update set payload=excluded.payload,recorded_at=excluded.recorded_at",[JSON.stringify(feed),now]);
  const cables=JSON.parse(await readFile('public/data/submarine-cables.json','utf8'));
  const reference={...common,id:'cables',reference:true,features:cables.features};
  await db.query("insert into ophanim_presentation_snapshots values('cables',$1,$2,$3) on conflict(feed_id) do update set payload=excluded.payload,item_count=excluded.item_count,recorded_at=excluded.recorded_at",[JSON.stringify(reference),cables.features.length,now]);
}
