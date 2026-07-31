import { db } from '@/lib/watchlists/db';
import { reconcileDisruptionImpacts, upsertIngestedDisruption } from './disruptions';
import { normalizeConflictEvents, normalizeEarthquakes } from './osiris-disruption-normalizer';

interface OrganizationOwner { organization_id: string; user_id: string; }

async function responseJson(origin: string, path: string): Promise<unknown> {
  const response = await fetch(new URL(path, origin), { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

export async function syncExistingOphanimDisruptions(origin: string): Promise<{ fetched: number; upserted: number; reconciled: number; errors: string[] }> {
  const [conflicts, earthquakes] = await Promise.allSettled([responseJson(origin, '/api/conflicts'), responseJson(origin, '/api/earthquakes')]);
  const normalized = [
    ...(conflicts.status === 'fulfilled' ? normalizeConflictEvents(conflicts.value) : []),
    ...(earthquakes.status === 'fulfilled' ? normalizeEarthquakes(earthquakes.value) : []),
  ];
  const errors = [conflicts, earthquakes].flatMap((result) => result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : 'Feed sync failed.'] : []);
  const owners = (await db().query<OrganizationOwner>(
    `select distinct on (organization_id) organization_id, user_id from ophanim_organization_memberships membership
     where role = 'owner' and exists (select 1 from ophanim_shipments shipment where shipment.organization_id = membership.organization_id and shipment.archived_at is null and shipment.current_status not in ('delivered', 'cancelled'))
     order by organization_id, created_at asc`,
  )).rows;
  let upserted = 0;
  let reconciled = 0;
  for (const owner of owners) {
    for (const item of normalized) {
      try {
        const disruption = await upsertIngestedDisruption(owner.organization_id, item);
        upserted++;
        await reconcileDisruptionImpacts({ organizationId: owner.organization_id, userId: owner.user_id, role: 'owner' }, disruption.id);
        reconciled++;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Disruption ingestion failed.');
      }
    }
  }
  return { fetched: normalized.length, upserted, reconciled, errors };
}
