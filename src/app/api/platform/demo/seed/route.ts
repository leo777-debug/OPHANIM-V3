import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { seedDemoScenario } from '@/lib/platform/demo';
import { platformError } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try { return NextResponse.json({ demo: await seedDemoScenario(await requireAuthenticatedActor(request, 'organization:manage')) }); }
  catch (error) { return platformError(error); }
}
