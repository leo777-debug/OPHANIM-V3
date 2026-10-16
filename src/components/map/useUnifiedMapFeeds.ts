'use client';

import { useEffect, useMemo, useState } from 'react';
import { feedIds, PRESENTATION_FEEDS } from '@/lib/presentation/feeds';
import { atlasPresentationData } from '@/lib/presentation/map-adapter';
import type { FeedId, PresentationFeed } from '@/lib/presentation/types';

export function useUnifiedMapFeeds(revision:number,refresh:number) {
  const [feeds,setFeeds]=useState<Partial<Record<FeedId,PresentationFeed>>>({});
  useEffect(()=>{
    const controller=new AbortController();
    const load=()=>{
      for(const id of feedIds)void(async()=>{
        try {
          const response=await fetch(`/api/map/feeds/${id}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
          if(!response.ok)throw new Error('Source unavailable');
          const {feed}:{feed:PresentationFeed}=await response.json();
          if(!feed || feed.id!==id || !Array.isArray(feed.features) || !Array.isArray(feed.news) || !Array.isArray(feed.sources))throw new Error('Invalid public feed');
          if(!controller.signal.aborted)setFeeds(current=>({...current,[id]:feed}));
        }catch{
          if(!controller.signal.aborted)setFeeds(current=>({...current,[id]:{id,features:[],news:[],sources:[],source:PRESENTATION_FEEDS[id].source,sourceUrl:PRESENTATION_FEEDS[id].url,fetchedAt:new Date().toISOString(),observedAt:null,reference:Boolean(PRESENTATION_FEEDS[id].reference),state:'unavailable',recordedAt:null,note:'Source could not be refreshed. No current data.'}}));
        }
      })();
    };
    load();const interval=setInterval(()=>{if(!document.hidden)load();},60000);
    return()=>{controller.abort();clearInterval(interval);};
  },[revision,refresh]);
  const allData=useMemo(()=>{
    const atlas=atlasPresentationData(feeds,new Set()).data;
    return {...atlas,
      earthquakes:atlas.earthquakes.map(item=>({...item,location:item.name,time:item.observedAt})),
      gdelt:atlas.gdelt.map(item=>({...item,title:item.name,date:item.observedAt})),
      news_sources:feeds.news?.sources??[],
    };
  },[feeds]);
  const available=Object.values(feeds).filter(feed=>feed.state!=='unavailable');
  const replay=available.filter(feed=>feed.state==='replay');
  return {feeds,data:allData,available:available.length,replay,loading:Object.keys(feeds).length<feedIds.length};
}
