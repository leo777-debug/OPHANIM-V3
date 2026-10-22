import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { refreshSupabaseSession } from '@/lib/supabase/proxy';
import { createServerClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getAuthenticatedActor } from '@/lib/auth/actor';
import { presentationSettingsOrOff,fullViewUnlocked } from '@/lib/presentation/settings';
import { presentationDestination,resolvePresentationView,protectedPresentationApi } from '@/lib/presentation/policy';
import { sameOrigin } from '@/lib/presentation/http';
import { VIEW_COOKIE } from '@/lib/presentation/types';
import { parseAtlasTool } from '@/lib/atlas-tools';

import { signInRequired } from '@/lib/auth/access-mode';
import { safeReturnTo } from '@/lib/auth/return-to';

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const sharedAccess = !signInRequired();
  if (sharedAccess && request.nextUrl.pathname === '/login') {
    const target = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));
    const destination = new URL(target, request.url);
    if (destination.pathname === '/login' || destination.pathname.startsWith('/api/')) destination.pathname = '/operations';
    return NextResponse.redirect(destination);
  }
  const response = sharedAccess ? NextResponse.next({ request }) : await refreshSupabaseSession(request);
  const path=request.nextUrl.pathname;
  if(protectedPresentationApi(path,request.method,Boolean(process.env.CUSTOMER_AIS_API_URL || process.env.MARINETRAFFIC_AIS_API_URL))) {
    try {
      const config=getSupabasePublicConfig();
      const auth=config?createServerClient(config.url,config.publishableKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll:()=>{}}}):null;
      if(!await getAuthenticatedActor(request,auth))return NextResponse.json({error:'Sign in to see your organization’s data.'},{status:401,headers:{'Cache-Control':'private, no-store'}});
      if(!['GET','HEAD','OPTIONS'].includes(request.method) && !sameOrigin(request))return NextResponse.json({error:'Cross-origin changes are not permitted.'},{status:403,headers:{'Cache-Control':'private, no-store'}});
    }catch{return NextResponse.json({error:'Authentication is unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
  }
  // Presentation redirects apply only to pages, never to authenticated APIs.
  if(!path.startsWith('/api/') && !path.startsWith('/admin') && !/\.[a-z0-9]+$/i.test(path)) {
    // Both sides of a redirect must read the current revision. Independent
    // cached ON/OFF values in proxy and page render can otherwise form a loop.
    const settings=await presentationSettingsOrOff(true);
    if(!settings.enabled && path==='/presentation')return NextResponse.redirect(new URL('/',request.url));
    if(settings.enabled) {
      const cookie=request.cookies.get(VIEW_COOKIE)?.value;
      let unlocked=false;
      try{unlocked=await fullViewUnlocked(cookie,settings);}catch{}
      const requested=request.nextUrl.searchParams.get('view');
      const view=resolvePresentationView(settings,requested,cookie,unlocked);
      const destination=presentationDestination(path,settings,view,request.nextUrl.searchParams.get('admin')==='1');
      if(destination) {
        const target=new URL(destination,request.url);
        if(target.pathname==='/presentation' && (path==='/atlas'||path==='/logistics/map')) {
          for(const key of ['tool','layers','lat','lng','lon','zoom','projection','style','mapVersion']) {
            const value=request.nextUrl.searchParams.get(key);
            if(value && value.length<=1200 && (key!=='tool'||parseAtlasTool(value)))target.searchParams.set(key,value);
          }
        }
        if(requested==='full' && view==='map')target.searchParams.set('unlock','1');
        const redirect=NextResponse.redirect(target);
        for(const item of response.cookies.getAll())redirect.cookies.set(item);
        redirect.headers.set('Cache-Control','no-store');
        return redirect;
      }
      response.headers.set('Cache-Control','no-store');
      if(requested==='map' || (requested==='full' && !settings.pinRequired))response.cookies.set(VIEW_COOKIE,view,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:4*3600});
    }
  }
  const endpoint = process.env.UMAMI_ENDPOINT;
  const website = process.env.UMAMI_WEBSITE_ID;

  if (endpoint && website && !request.nextUrl.pathname.startsWith('/api/')) {
    const userAgent = request.headers.get('user-agent') || 'Unknown Ophanim Client';
    event.waitUntil(fetch(`${endpoint.replace(/\/$/, '')}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent },
      body: JSON.stringify({
        payload: {
          hostname: request.nextUrl.hostname,
          language: 'en-US',
          referrer: request.headers.get('referer') || '',
          screen: '1920x1080',
          title: 'OPHANIM',
          url: request.nextUrl.pathname,
          website,
        },
        type: 'event',
      }),
    }).catch(() => undefined));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
