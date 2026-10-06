import { db } from '@/lib/db/pool';
import type { OrganizationActor } from '@/lib/operations/types';
import { object, text } from './validation';

export async function queuePlatformNotification(actor: OrganizationActor, value: unknown) {
  const input = object(value, 'Notification');
  const eventType = text(input.eventType, 'Notification event type', 120)!;
  const title = text(input.title, 'Notification title', 500)!;
  const summary = text(input.summary, 'Notification summary', 2000)!;
  const payload = object(input.payload, 'Notification payload');
  const result = await db().query(`insert into ophanim_notification_events(organization_id,event_type,title,summary,payload) values($1,$2,$3,$4,$5) returning *`, [actor.organizationId, eventType, title, summary, JSON.stringify(payload)]);
  return result.rows[0];
}

export async function listPlatformNotifications(actor: OrganizationActor) {
  return (await db().query(`select * from ophanim_notification_events where organization_id=$1 order by created_at desc limit 100`, [actor.organizationId])).rows;
}
