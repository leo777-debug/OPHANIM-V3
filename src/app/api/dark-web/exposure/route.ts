import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/watchlists/db';
import { synchronizeOperationalEntities } from '@/lib/dark-web/entity-registry';
import { scanTenantExposure } from '@/lib/dark-web/deep-watch';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron (INTELLIGENCE_ALERT_CRON_SECRET): for each organization, refresh the entity watchlist from live
 * shipments and job files, then scan only those identifiers. Alerts flow through the existing
 * review queue and are delivered by /api/intelligence/cron.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.INTELLIGENCE_ALERT_CRON_SECRET ?? '', supplied = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!secret || supplied.length !== secret.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // A real owner or operations manager is the actor, so audit records name a person who can review them.
    const organizations = (await db().query<{ organization_id: string; user_id: string }>(
      `select distinct on (organization_id) organization_id, user_id from ophanim_organization_memberships where role in ('owner','operations_manager') order by organization_id, case role when 'owner' then 0 else 1 end, created_at`)).rows;
    const results = [];
    for (const row of organizations) {
      const actor = { organizationId: row.organization_id, userId: row.user_id, role: 'operations_manager' as const };
      try { const synchronized = await synchronizeOperationalEntities(actor); const scan = await scanTenantExposure(actor, request.signal); results.push({ organizationId: row.organization_id, synchronized, queries: scan.queries, stored: scan.stored, droppedProhibited: scan.droppedProhibited, errors: scan.errors, alertsCreated: scan.reconciliation.alertsCreated }); }
      catch (error) { results.push({ organizationId: row.organization_id, error: error instanceof Error ? error.message.slice(0, 200) : 'failed' }); }
    }
    return NextResponse.json({ results });
  } catch { return NextResponse.json({ error: 'Exposure scan unavailable.' }, { status: 503 }); }
}
