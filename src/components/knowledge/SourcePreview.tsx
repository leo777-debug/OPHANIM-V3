'use client';
import { useEffect,useState } from 'react';
import type { SourceReference } from '@/lib/knowledge/types';
export default function SourcePreview({id}:{id:string}) {
  const [data,setData]=useState<{document:{fileName:string};chunks:Array<{id:string;content:string;reference:SourceReference}>}|null>(null);const [error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();void fetch(`/api/knowledge/documents/${id}`,{signal:controller.signal}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);setData(b);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[id]);
  useEffect(()=>{if(data){const chunk=new URLSearchParams(window.location.search).get('chunk');if(chunk)document.getElementById(chunk)?.scrollIntoView({block:'center'});}},[data]);
  return <div className="platform-content"><section className="platform-section"><h2>{data?.document.fileName ?? 'Source preview'}</h2>{error && <p role="alert">{error}</p>}<a href={`/api/knowledge/documents/${id}?download=1`}>Download original private file</a>
    {data?.chunks.map(c=><article key={c.id} id={c.id} style={{margin:'24px 0',padding:16,border:'1px solid #455'}}><small>{Object.entries(c.reference).map(([k,v])=>`${k}: ${v}`).join(' · ') || 'Document text'}</small><pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit'}}>{c.content}</pre></article>)}
  </section></div>;
}
