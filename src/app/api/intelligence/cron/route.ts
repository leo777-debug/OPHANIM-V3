import { callForecastWorker } from '@/lib/forecast/http';
import { queueForecastAlerts } from '@/lib/forecast/alerts';
import { checkCameraHealth } from '@/lib/watchtower/health';
import { NextRequest, NextResponse } from 'next/server';
import { sendPendingIntelligenceDeliveries } from '@/lib/intelligence/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!process.env.INTELLIGENCE_ALERT_CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.INTELLIGENCE_ALERT_CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const outcomes=await callForecastWorker('/resolve',{}).catch(()=>({status:'unavailable'}));
  const cameras=await checkCameraHealth();
  const forecasts=await queueForecastAlerts();
  return NextResponse.json({deliveries:await sendPendingIntelligenceDeliveries(),outcomes,cameras,forecasts});
}
