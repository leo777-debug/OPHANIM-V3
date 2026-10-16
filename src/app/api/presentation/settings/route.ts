import { NextRequest, NextResponse } from 'next/server';
import { presentationAdmin,presentationBody,presentationFailure } from '@/lib/presentation/http';
import { readPresentationSettings,updatePresentationSettings } from '@/lib/presentation/settings';
export const dynamic='force-dynamic';
export async function GET() {
  try { return NextResponse.json({settings:await readPresentationSettings()}, {headers:{'Cache-Control':'no-store'}}); }
  catch(error){return presentationFailure(error);}
}
export async function PATCH(request:NextRequest) {
  try {const actor=await presentationAdmin(request);const settings=await updatePresentationSettings(actor,await presentationBody(request));return NextResponse.json({settings},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return presentationFailure(error);}
}
