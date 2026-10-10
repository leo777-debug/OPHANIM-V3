'use client';
import { useState } from 'react';
export default function EmbeddingSetup(){
  const [baseUrl,setBaseUrl]=useState('http://localhost:11434/v1');const [model,setModel]=useState('qwen3-embedding:0.6b');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  async function load(){setBusy(true);try{const r=await fetch('/api/knowledge/settings');const b=await r.json();if(!r.ok)throw new Error(b.error);setBaseUrl(b.baseUrl || 'http://localhost:11434/v1');setModel(b.model || 'qwen3-embedding:0.6b');setMessage('Loaded organization embedding settings.');}catch(e){setMessage(e instanceof Error ? e.message:'Settings unavailable.');}finally{setBusy(false);}}
  async function save(){setBusy(true);try{const r=await fetch('/api/knowledge/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl,model})});const b=await r.json();if(!r.ok)throw new Error(b.error);setMessage('Connection tested and settings saved for this organization.');}catch(e){setMessage(e instanceof Error ? e.message:'Unable to save.');}finally{setBusy(false);}}
  return <details><summary className="text-xs">Knowledge embeddings</summary><p className="text-xs">Multilingual embeddings, 1024 dimensions. Organization owners can configure a local or customer-selected server. Protected endpoint keys use server environment settings.</p>
    <label className="block text-xs">Embedding base URL<input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} className="w-full bg-[var(--bg-tertiary)] border rounded px-2 py-1"/></label>
    <label className="block text-xs">Embedding model<input value={model} onChange={e=>setModel(e.target.value)} className="w-full bg-[var(--bg-tertiary)] border rounded px-2 py-1"/></label>
    <button type="button" disabled={busy} onClick={()=>void load()}>Load settings</button> <button type="button" disabled={busy} onClick={()=>void save()}>Test and save embeddings</button><p role="status" className="text-xs">{message}</p>
  </details>;
}
