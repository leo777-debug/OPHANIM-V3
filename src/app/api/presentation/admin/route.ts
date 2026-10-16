import { NextRequest,NextResponse } from 'next/server';
import { presentationAdmin,presentationFailure } from '@/lib/presentation/http';
import { readPresentationSettings } from '@/lib/presentation/settings';
import { snapshotStatus } from '@/lib/presentation/snapshots';
import { PRESENTATION_VERIFY_AVAILABLE } from '@/lib/presentation/types';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  try {await presentationAdmin(request);return NextResponse.json({settings:await readPresentationSettings(true),snapshots:await snapshotStatus(),verifyAvailable:PRESENTATION_VERIFY_AVAILABLE},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return presentationFailure(error);}
}
