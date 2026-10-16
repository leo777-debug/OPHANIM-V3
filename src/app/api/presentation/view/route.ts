import { NextRequest,NextResponse } from 'next/server';
import { readPresentationSettings,fullViewUnlocked,unlockFullView } from '@/lib/presentation/settings';
import { presentationBody,presentationFailure,PresentationError,sameOrigin } from '@/lib/presentation/http';
import { safeReturnPath,resolvePresentationView } from '@/lib/presentation/policy';
import { VIEW_COOKIE } from '@/lib/presentation/types';
import { getClientIp,isRateLimited } from '@/lib/ssrf-guard';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  try {
    const settings=await readPresentationSettings();
    const cookie=request.cookies.get(VIEW_COOKIE)?.value;
    const unlocked=await fullViewUnlocked(cookie,settings);
    return NextResponse.json({view:resolvePresentationView(settings,null,cookie,unlocked)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return presentationFailure(error);}
}
export async function POST(request:NextRequest) {
  try {
    if(!sameOrigin(request))throw new PresentationError('Cross-origin switches are not permitted.',403);
    const settings=await readPresentationSettings(true);
    if(!settings.enabled)throw new PresentationError('Presentation mode is off.',409);
    const body=await presentationBody(request);
    if(body.view!=='map' && body.view!=='full')throw new PresentationError('Choose Map view or Full platform.');
    let cookie:string=body.view;
    if(body.view==='full' && settings.pinRequired) {
      const previous=request.cookies.get(VIEW_COOKIE)?.value;
      if(await fullViewUnlocked(previous,settings))cookie=previous!;
      else {
        if(isRateLimited(`presentation:pin:${getClientIp(request)}`,8) || isRateLimited('presentation:pin:global',60))throw new PresentationError('Too many PIN attempts. Try again in a minute.',429);
        cookie=await unlockFullView(body.pin);
      }
    }
    const response=NextResponse.json({view:body.view,href:body.view==='map'?'/presentation?view=map':safeReturnPath(body.returnTo)},{headers:{'Cache-Control':'no-store'}});
    response.cookies.set(VIEW_COOKIE,cookie,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:4*3600});
    return response;
  }catch(error){return presentationFailure(error);}
}
