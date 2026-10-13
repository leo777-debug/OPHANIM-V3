'use client';
import Link from 'next/link';
import { useCallback,useEffect,useRef,useState } from 'react';
import { readClientAiConfig } from '@/lib/ai/client-config';
import type { KnowledgeStatement,SourceReference } from '@/lib/knowledge/types';

interface Document { id:string;organization_id:string|null;file_name:string;status:string;progress:number;error:string|null;file_size_bytes:number;published_at:string|null;valid_from:string|null;valid_to:string|null;ingested_at:string|null;metadata?:{source?:string;licence?:string;licence_url?:string} }
interface Citation { id:string;fileName:string;reference:SourceReference;date:string|null;url:string }
interface Answer { statements:KnowledgeStatement[];citations:Citation[];warning?:string;searched?:unknown }
export default function KnowledgeWorkspace({shared=false}:{shared?:boolean}) {
  const [documents,setDocuments]=useState<Document[]>([]); const [bytes,setBytes]=useState(0); const [message,setMessage]=useState('');
  const [question,setQuestion]=useState(''); const [currentOnly,setCurrentOnly]=useState(false); const [asOf,setAsOf]=useState(''); const [mode,setMode]=useState('logistics');
  const [answer,setAnswer]=useState<Answer|null>(null); const [busy,setBusy]=useState(false); const [dragging,setDragging]=useState(false);
  const [documentType,setDocumentType]=useState('other');const [publishedAt,setPublishedAt]=useState('');const [validFrom,setValidFrom]=useState('');const [validTo,setValidTo]=useState('');
  const fileInput=useRef<HTMLInputElement>(null);
  const endpoint=shared ? '/api/knowledge/shared':'/api/knowledge/documents';
  const load=useCallback(async()=>{
    const response=await fetch(endpoint,{cache:'no-store'}); const body=await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Knowledge unavailable.');
    setDocuments(body.documents); setBytes(body.storageBytes);
  },[endpoint]);
  useEffect(()=>{ let active=true; const refresh=()=>void load().catch(e=>{if(active)setMessage(e.message);}); refresh(); const timer=setInterval(refresh,5000);return()=>{active=false;clearInterval(timer);};},[load]);
  async function upload(files:FileList|File[]) {
    setBusy(true); setMessage('Uploading to private storage…');
    const errors:string[]=[];
    try {
      for(let offset=0;offset<files.length;offset+=10) {
        const form=new FormData(); Array.from(files).slice(offset,offset+10).forEach(f=>form.append('files',f));
        form.append('metadata',JSON.stringify({document_type:documentType,published_at:publishedAt || undefined,valid_from:validFrom || undefined,valid_to:validTo || undefined}));
        const response=await fetch(endpoint,{method:'POST',body:form});const body=await response.json();
        if(!response.ok)throw new Error(body.error);
        for(const result of body.results)if(result.error)errors.push(`${result.file}: ${result.error}`);
      }
      setMessage(errors.length ? errors.join('\n'):'Files queued. Background processing starts when the knowledge worker runs.');await load();
    }catch(e){setMessage(e instanceof Error ? e.message:'Upload failed.');}finally{setBusy(false);}
  }
  async function ask(searchOnly=false) {
    setBusy(true);setMessage('');setAnswer(null);
    try {
      const response=await fetch(searchOnly ? '/api/knowledge/search':'/api/knowledge/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,mode,config:readClientAiConfig(),filters:{currentOnly,asOf:asOf || undefined}})});const body=await response.json();
      if(!response.ok)throw new Error(body.error);
      if(searchOnly)setAnswer({statements:[],warning:body.warning,citations:body.chunks.map((c:{id:string;document_id:string;source_file:string;reference:SourceReference;published_at:string})=>({id:c.id,fileName:c.source_file,reference:c.reference,date:c.published_at,url:`/knowledge/documents/${c.document_id}?chunk=${c.id}`})),searched:body.searched});
      else setAnswer(body);
    }catch(e){setMessage(e instanceof Error ? e.message:'Question failed.');}finally{setBusy(false);}
  }
  async function remove(id:string) {
    try {const response=await fetch(`/api/knowledge/documents/${id}`,{method:'DELETE'});const body=await response.json();if(!response.ok)throw new Error(body.error);await load();}
    catch(e){setMessage(e instanceof Error ? e.message:'Deletion failed.');}
  }
  return <div className="platform-content">
    <section className="platform-section"><div className="platform-section__heading"><div><p>{shared ? 'Deployment administration':'Company + shared sources'}</p><h2>{shared ? 'Shared knowledge catalogue':'Knowledge'}</h2></div><span>{(bytes/1024/1024).toFixed(2)} MB stored</span></div>
      <p>{shared ? 'Review source licences and validity dates. Shared uploads require the deployment administrator’s backend credentials.':'Upload documents for your organization, then search or ask questions with source citations.'}</p>
      {!shared && <details><summary>Upload source dates and document type</summary><label>Type <select value={documentType} onChange={e=>setDocumentType(e.target.value)}>{['other','awb','bill_of_lading','invoice','packing_list','booking_confirmation','arrival_notice','delivery_order','email','contract','sop'].map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}</select></label> <label>Published <input type="date" value={publishedAt} onChange={e=>setPublishedAt(e.target.value)}/></label> <label>Valid from <input type="date" value={validFrom} onChange={e=>setValidFrom(e.target.value)}/></label> <label>Valid until <input type="date" value={validTo} onChange={e=>setValidTo(e.target.value)}/></label><p>Applies to this upload batch. Undated files are excluded from current/as-of searches.</p></details>}
      {!shared && <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(!busy)void upload(e.dataTransfer.files);}} style={{border:`1px dashed ${dragging ? '#7cffcb':'#566'}`,padding:24,margin:'16px 0'}}>
        <label>Drag files here, or select files<input ref={fileInput} type="file" multiple disabled={busy} accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.eml,.png,.jpg,.jpeg" onChange={e=>{if(e.target.files)void upload(e.target.files);}} /></label>
        <p>10 MB per file. Scanned PDFs and images require the OCR runtime.</p>
      </div>}
      <p role="status" style={{whiteSpace:'pre-wrap'}}>{message}</p>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>File</th><th>Status</th><th>Source / licence</th><th>Validity / refresh</th><th>Action</th></tr></thead><tbody>
        {documents.map(d=><tr key={d.id}><td><Link href={`/knowledge/documents/${d.id}`}>{d.file_name}</Link><br/><small>{d.organization_id ? 'Your organization':'Shared'}</small></td><td>{d.status} {d.progress}%{d.error && <p role="alert">{d.error}</p>}</td><td>{d.metadata?.source ?? 'Private upload'}<br/>{d.metadata?.licence_url ? <a href={d.metadata.licence_url} target="_blank" rel="noreferrer">{d.metadata.licence}</a>:d.metadata?.licence}</td><td>{d.valid_from ?? 'Undated'} → {d.valid_to ?? 'No end supplied'}<br/><small>Indexed: {d.ingested_at ?? 'Pending'}</small></td><td>{d.organization_id && !shared && <button disabled={d.status==='deleting'} onClick={()=>void remove(d.id)}>Delete</button>}</td></tr>)}
      </tbody></table></div>
    </section>
    {!shared && <section className="platform-section"><h2>Ask your knowledge</h2>
      <form onSubmit={e=>{e.preventDefault();void ask();}}><label>Question<input style={{width:'100%'}} value={question} maxLength={2000} onChange={e=>setQuestion(e.target.value)} required /></label>
        <div style={{display:'flex',gap:16,flexWrap:'wrap',margin:'12px 0'}}><label>Mode <select value={mode} onChange={e=>setMode(e.target.value)}><option value="logistics">Logistics</option><option value="general">General</option></select></label><label><input type="checkbox" checked={currentOnly} onChange={e=>{setCurrentOnly(e.target.checked);setAsOf('');}}/> Current valid sources only</label><label>As of <input type="date" value={asOf} disabled={currentOnly} onChange={e=>setAsOf(e.target.value)} /></label></div>
        <button disabled={busy || !question.trim()} type="submit">{busy ? 'Working…':'Ask'}</button> <button type="button" disabled={busy || !question.trim()} onClick={()=>void ask(true)}>Search sources without AI</button>
      </form>
      {answer && <div aria-live="polite">{answer.warning && <p>{answer.warning}</p>}{answer.statements.map((s,i)=><p key={i}><strong>{s.label}</strong> {s.text} {s.citations.map(id=>{const c=answer.citations.find(c=>c.id===id);return c ? <Link key={id} href={c.url}>[{c.fileName}]</Link>:null;})}</p>)}
        <h3>Sources searched / retrieved</h3><p>Your organization and shared knowledge; {currentOnly ? 'current valid sources':asOf ? `as of ${asOf}`:'all dates'}. Query: {question}</p>
        <ul>{answer.citations.map(c=><li key={c.id}><Link href={c.url}>{c.fileName}</Link> {Object.entries(c.reference).map(([key,value])=>`${key}: ${value}`).join(', ')} — {c.date ?? 'date not supplied'}</li>)}</ul>
      </div>}
    </section>}
  </div>;
}
