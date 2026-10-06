import { db } from '@/lib/db/pool';
import type { OrganizationActor } from '@/lib/operations/types';
import { getOrganizationConfiguration } from './capabilities';

const SAFE_EVENTS = new Set(['login', 'search.performed', 'entity.viewed', 'entity.tracked', 'map.used', 'provider.result_opened', 'case.created', 'task.assigned', 'workflow.completed', 'csv.imported', 'alert.acknowledged', 'evidence.opened']);

export async function recordProductEvent(actor: OrganizationActor, eventName: string, metadata: Record<string, unknown> = {}) {
  if (!SAFE_EVENTS.has(eventName)) return;
  const configuration = await getOrganizationConfiguration(actor);
  if (!configuration.analyticsEnabled) return;
  await db().query(`insert into ophanim_product_events(organization_id,user_id,event_name,metadata) values($1,$2,$3,$4)`, [actor.organizationId, actor.userId, eventName, JSON.stringify(metadata)]);
}
