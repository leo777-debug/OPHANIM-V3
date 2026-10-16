import { NextResponse } from 'next/server';
import { demoReplayStatus } from '@/lib/demo-replay';
export const dynamic='force-dynamic';
export function GET() {return NextResponse.json(demoReplayStatus(),{headers:{'Cache-Control':'no-store'}});}
