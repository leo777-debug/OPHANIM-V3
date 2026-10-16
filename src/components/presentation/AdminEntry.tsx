'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
export default function AdminEntry() {
  const [owner,setOwner]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/auth/me',{cache:'no-store',signal:controller.signal}).then(response=>response.ok?response.json():null).then(body=>setOwner(body?.actor?.role==='owner')).catch(()=>{});
    return ()=>controller.abort();
  },[]);
  return owner?<Link href="/admin">Admin</Link>:null;
}
