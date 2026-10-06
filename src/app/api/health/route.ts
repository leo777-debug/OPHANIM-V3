import { NextResponse } from 'next/server';
import { criticalEnvironmentIssue } from '@/lib/config/environment';

export async function GET() {
  return NextResponse.json({
    status: criticalEnvironmentIssue() ? 'degraded' : 'operational',
    platform: 'OPHANIM',
    version: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? 'development',
    uptime: process.uptime ? Math.round(process.uptime()) : 0,
    timestamp: new Date().toISOString(),
    ...(criticalEnvironmentIssue() ? { configuration: 'incomplete' } : {}),
  });
}
