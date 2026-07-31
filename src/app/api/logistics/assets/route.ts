import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { createAsset, listAssets } from '@/lib/logistics/roll-call';
const failure=(error:unknown)=>NextResponse.json({error:error instanceof Error?error.message:'Asset request failed.'},{status:error instanceof OrganizationAccessError?403:400});
export async function GET(request:NextRequest){try{return NextResponse.json({assets:await listAssets(await requireAuthenticatedActor(request,'vulnerability:read'))})}catch(error){return failure(error)}}
export async function POST(request:NextRequest){try{return NextResponse.json({asset:await createAsset(await requireAuthenticatedActor(request,'vulnerability:write'),await request.json())},{status:201})}catch(error){return failure(error)}}
