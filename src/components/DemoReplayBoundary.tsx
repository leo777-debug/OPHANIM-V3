'use client';
import { useEffect,useState,type ReactNode } from 'react';

export default function DemoReplayBoundary({children}:{children:ReactNode}) {
  const [createdAt,setCreatedAt]=useState<string|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/demo-status',{cache:'no-store',signal:controller.signal}).then(async(response)=>{
      if(!response.ok)return;
      const status=await response.json();
      if(!controller.signal.aborted && status.enabled===true && status.provenance==='synthetic_fixture' && typeof status.createdAt==='string' && Number.isFinite(Date.parse(status.createdAt)))setCreatedAt(new Date(status.createdAt).toISOString());
    }).catch(()=>{});
    return()=>controller.abort();
  },[]);
  return <div className={createdAt ? 'demo-replay-root demo-replay-root--active':'demo-replay-root'}>
    {createdAt && <aside className="demo-replay-notice" role="status" aria-label="Synthetic demo replay">
      <strong>DEMO REPLAY</strong><span>Synthetic fixtures created <time dateTime={createdAt}>{createdAt.slice(0,19).replace('T',' ')} UTC</time>. Not live data.</span>
    </aside>}
    <div className="demo-replay-surface">{children}</div>
  </div>;
}
