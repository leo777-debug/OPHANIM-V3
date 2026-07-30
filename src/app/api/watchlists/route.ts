import { NextRequest, NextResponse } from 'next/server';
import { createWatchlist, listWatchlists } from '@/lib/watchlists/service';
const owner=(r:NextRequest)=>r.cookies.get('ophanim_watchlist_owner')?.value||crypto.randomUUID(); const response=(data:any,id:string)=>{const r=NextResponse.json(data); r.cookies.set('ophanim_watchlist_owner',id,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:31536000,path:'/'});return r;};
export async function GET(r:NextRequest){const id=owner(r);return response({watchlists:await listWatchlists(id)},id)}
export async function POST(r:NextRequest){const id=owner(r);try{return response({watchlist:await createWatchlist(id,await r.json())},id)}catch(e){return response({error:e instanceof Error?e.message:'Invalid watchlist'},id)}}
