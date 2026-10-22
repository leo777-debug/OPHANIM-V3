import { NextResponse } from 'next/server';
import { classifyOperationalCamera } from '../operational-context';
import { parseCameraIndexQuery, searchCameraIndex } from '@/lib/cameras/windy';

export async function GET(request: Request) {
  let query;
  try { query = parseCameraIndexQuery(new URL(request.url).searchParams); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid camera query.' }, { status: 400 }); }
  const result = await searchCameraIndex(query);
  return NextResponse.json({ ...result, cameras: result.cameras.map(classifyOperationalCamera) }, {
    status: result.status === 'not_configured' || result.status === 'unavailable' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
