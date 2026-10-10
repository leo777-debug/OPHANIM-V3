"""Licence-gated source adapters. No customer inputs or unrestricted auto-fetch."""
import argparse
import csv
import hashlib
import io
import json
import math
import os
import shutil
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

REGISTRY=Path(__file__).resolve().parents[1]/'configs'/'sources.json'


def timestamp(value):
    if value is None or value=='':return None
    if isinstance(value,(int,float)):return datetime.fromtimestamp(value/1000,timezone.utc).isoformat()
    text=str(value).replace(' ','T')
    if len(text)==15 and text.endswith('Z'):return datetime.strptime(text,'%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc).isoformat()
    try:return datetime.fromisoformat(text.replace('Z','+00:00')).isoformat()
    except ValueError:return None


def event(source,id_,type_,name,lat,lon,start,end=None,severity='unknown',links=None,impact=None):
    return {'id':f'{source}:{id_}','type':type_,'place':{'name':name,'latitude':lat,'longitude':lon,'nearest_ports':[],'nearest_airports':[]},'start':timestamp(start),'end':timestamp(end),'severity':severity,'source':source,'links':links or [],'logistics_impact':impact,'supporting_evidence_only':source=='gdelt'}


def normalise(source,data):
    if source=='usgs':
        for f in data.get('features',[]):
            p=f['properties'];lon,lat,*_=f['geometry']['coordinates']
            yield event(source,f['id'],'earthquake',p.get('place'),lat,lon,p.get('time'),severity={'magnitude':p.get('mag'),'scale':'moment magnitude; not logistics severity'},links=[p['url']])
    elif source=='eonet':
        for e in data.get('events',[]):
            point=next((g for g in e.get('geometry',[]) if g.get('type')=='Point'),{})
            lon,lat=point.get('coordinates',[None,None])
            yield event(source,e['id'],e.get('categories',[{'id':'disaster'}])[0]['id'],e['title'],lat,lon,point.get('date'),e.get('closed'),links=[s['url'] for s in e.get('sources',[])])
    elif source=='ibtracs':
        rows=list(csv.DictReader(io.StringIO(data)))
        groups={}
        for row in rows:
            try:lat=float(row['LAT']);lon=float(row['LON'])
            except (ValueError,KeyError):continue # Skip units row
            key=row['SID'];groups.setdefault(key,[]).append(row)
        for key,track in groups.items():
            first,last=track[0],track[-1]
            yield event(source,key,'tropical_cyclone',first.get('NAME'),float(first['LAT']),float(first['LON']),first['ISO_TIME'],last['ISO_TIME'],links=['https://www.ncei.noaa.gov/products/international-best-track-archive'])
    elif source=='gdelt':
        for a in data.get('articles',[]):
            yield event(source,hashlib.sha256(a['url'].encode()).hexdigest()[:16],'news_report',a.get('sourcecountry'),None,None,a.get('seendate'),links=[a['url']],impact=a.get('title'))
    elif source=='reliefweb':
        for r in data.get('data',[]):
            f=r['fields'];country=(f.get('country') or [{}])[0]
            # No report body or attachments copied; title + link only.
            yield event(source,r['id'],'disaster_report',country.get('name'),None,None,f.get('date',{}).get('original'),links=[f.get('url')],impact=f.get('title'))
    elif source=='gdacs':
        for f in data.get('features',[]):
            p=f['properties'];coords=(f.get('geometry') or {}).get('coordinates',[None,None]);lon,lat=coords[:2]
            yield event(source,p.get('eventid',f.get('id')),p.get('eventtype','disaster'),p.get('country'),lat,lon,p.get('fromdate'),p.get('todate'),severity=p.get('alertlevel','unknown'),links=[p.get('url',{}).get('report')] if isinstance(p.get('url'),dict) else [])
    elif source=='ucdp':
        rows=csv.DictReader(io.StringIO(data)) if isinstance(data,str) else data
        for r in rows:yield event(source,r['id'],'conflict',r.get('where_prec'),float(r['latitude']),float(r['longitude']),r.get('date_start'),r.get('date_end'),links=['https://ucdp.uu.se/'],impact=None)
    elif source=='wikidata':
        for qid,e in data.get('entities',{}).items():
            def claim(prop):
                claims=e.get('claims',{}).get(prop,[])
                return claims[0].get('mainsnak',{}).get('datavalue',{}).get('value') if claims else None
            coords=claim('P625') or {};start=claim('P580') or claim('P585') or {};end=claim('P582') or {}
            yield event(source,qid,'historical_event',e.get('labels',{}).get('en',{}).get('value',qid),coords.get('latitude'),coords.get('longitude'),str(start.get('time','')).lstrip('+'),str(end.get('time','')).lstrip('+'),links=[f'https://www.wikidata.org/wiki/{qid}'])
    else:
        # Licence-cleared EM-DAT, ACLED and provider exports must first be mapped
        # to this explicit event format, rather than inferring sensitive fields.
        for r in data if isinstance(data,list) else data.get('events',[]):
            if not all(k in r for k in ('type','place','start','source','links')):raise ValueError('Input requires normalised event schema')
            yield r


def nearest(event_,gazetteer):
    p=event_['place'];lat,lon=p.get('latitude'),p.get('longitude')
    if lat is None or lon is None:return
    def distance(item):
        a,b=map(math.radians,[lat,item['latitude']]);delta=math.radians(item['longitude']-lon)
        return 6371*2*math.asin(min(1,math.sqrt(math.sin((b-a)/2)**2+math.cos(a)*math.cos(b)*math.sin(delta/2)**2)))
    for kind in ('port','airport'):
        candidates=sorted([x for x in gazetteer if x['type']==kind],key=distance)
        p['nearest_'+kind+'s']=[{'code':x['code'],'distance_km':round(distance(x),1)} for x in candidates[:3]]


def archive(root,older_than_days=30):
    cutoff=datetime.now(timezone.utc)-timedelta(days=older_than_days)
    for sidecar in (root/'present').glob('*.meta.json'):
        m=json.loads(sidecar.read_text(encoding='utf-8'));published=timestamp(m.get('published_at'))
        if not published or datetime.fromisoformat(published).replace(tzinfo=timezone.utc)>=cutoff:continue
        file=Path(str(sidecar)[:-10]);destination=root/'past'/file.name
        if destination.exists() or Path(str(destination)+'.meta.json').exists():continue
        # Preserve dates and metadata byte-for-byte, don't rewrite history as now.
        file.rename(destination);sidecar.rename(Path(str(destination)+'.meta.json'))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',choices=list(json.loads(REGISTRY.read_text())['sources']));p.add_argument('--start',default='2021-01-01');p.add_argument('--end',default='2026-10-10');p.add_argument('--input');p.add_argument('--rights',help='Reviewed source-specific commercial-use sidecar; required for excluded sources');p.add_argument('--root',default='knowledge');p.add_argument('--gazetteer');p.add_argument('--present',action='store_true');p.add_argument('--qid',help='Wikidata entity ID');args=p.parse_args()
    source=json.loads(REGISTRY.read_text())['sources'][args.source]
    if args.rights:
        rights=json.loads(Path(args.rights).read_text(encoding='utf-8'))
        if rights.get('source')!=args.source or rights.get('customer_data') is not False or rights.get('commercial_use') is not True or not rights.get('licence_url') or not rights.get('reviewed_at') or not rights.get('licence'):raise RuntimeError('Invalid commercial rights record')
        source.update(rights)
    if not source['commercial_use']:raise RuntimeError(f'{args.source} excluded: {source["licence"]}. Supply reviewed commercial rights with --rights.')
    folder=Path(args.root).resolve();folder.mkdir(parents=True,exist_ok=True)
    if shutil.disk_usage(folder).free<1024**3:raise RuntimeError('Knowledge volume needs at least 1 GiB free')
    for part in ('past','present'):(folder/part).mkdir(exist_ok=True)
    if args.input:raw=Path(args.input).read_bytes();url=source.get('url') or source['licence_url']
    else:
        url=source.get('url')
        if args.source=='wikidata' and args.qid and args.qid.startswith('Q') and args.qid[1:].isdigit():url=f'https://www.wikidata.org/wiki/Special:EntityData/{args.qid}.json'
        if not url:raise RuntimeError('Use --input with a licence-cleared source export (or --qid for Wikidata).')
        url=url.format(start=args.start,end=args.end,start_compact=args.start.replace('-',''),end_compact=args.end.replace('-',''))
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Ophanim/1.0 logistics knowledge importer'}),timeout=120) as response:
            raw=response.read(64*1024**2+1)
        if len(raw)>64*1024**2:raise RuntimeError('Source response exceeds 64 MiB; use a smaller date range')
    text=raw.decode('utf-8-sig');data=text if args.source in ('ibtracs','ucdp') else json.loads(text)
    events=list(normalise(args.source,data))
    if args.gazetteer:
        gmeta=json.loads(Path(args.gazetteer+'.meta.json').read_text())
        if gmeta.get('commercial_use') is not True or gmeta.get('customer_data') is not False:raise RuntimeError('Gazetteer licence not cleared')
        points=json.loads(Path(args.gazetteer).read_text())
        for e in events:nearest(e,points)
    for e in events:
        if not e.get('start'):raise RuntimeError('Event lacks a trustworthy start date; exclude or correct the source export')
    stamp=datetime.now(timezone.utc).isoformat()
    name=f'{args.source}-{args.start}-{args.end}-{hashlib.sha256(raw).hexdigest()[:12]}.json'
    file=folder/('present' if args.present else 'past')/name
    if file.exists():raise RuntimeError('Snapshot exists; not overwriting')
    metadata=dict(source=args.source,source_url=url,licence=source['licence'],licence_url=source['licence_url'],commercial_use=True,customer_data=False,reviewed_at=source.get('reviewed_at','2026-10-10'),attribution=source['attribution'],published_at=stamp,valid_from=args.start,valid_to=args.end,region='Global',language='en',raw_sha256=hashlib.sha256(raw).hexdigest())
    file.write_text(json.dumps({'events':events},ensure_ascii=False,indent=2),encoding='utf-8');Path(str(file)+'.meta.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    archive(folder);print(json.dumps({'file':str(file),'events':len(events),'commercial_use':True}))
