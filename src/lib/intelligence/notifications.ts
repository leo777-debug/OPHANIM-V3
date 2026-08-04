import { Resend } from 'resend';
import { appUrl, mapLink } from '@/lib/intelligence/urls';
import { db } from '@/lib/watchlists/db';

export interface AlertDeliveryCandidate {
  id: string;
  organizationId: string;
  assessmentId: string;
  category: 'logistics' | 'cyber';
  title: string;
  summary: string;
  confidenceScore: number;
  subjectLabel: string;
  sourceName: string;
  sourceReference?: string;
}

export async function queueIntelligenceAlertDeliveries(alert: AlertDeliveryCandidate): Promise<number> {
  const settings = await db().query<{ id: string; mode: 'immediate' | 'digest'; next_digest_at: string | null }>(
    `select id, mode, next_digest_at from ophanim_intelligence_notification_settings
     where organization_id = $1 and enabled and minimum_confidence <= $2`,
    [alert.organizationId, alert.confidenceScore],
  );
  for (const setting of settings.rows) {
    await db().query(
      `insert into ophanim_intelligence_deliveries(organization_id, alert_id, setting_id, kind, payload, next_attempt_at)
       values($1, $2, $3, $4, $5, $6)`,
      [alert.organizationId, alert.id, setting.id, setting.mode, JSON.stringify({ assessmentId: alert.assessmentId }), setting.mode === 'digest' ? setting.next_digest_at ?? new Date() : new Date()],
    );
  }
  return settings.rowCount ?? 0;
}

interface DeliveryRow {
  id: string; setting_id: string; kind: 'immediate' | 'digest'; attempts: number; email: string; digest_minutes: number;
  alert_id: string; alert_category: 'logistics' | 'cyber'; title: string; summary: string; confidence_score: number;
  subject_label: string; source_name: string; source_reference: string | null;
}

const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

function message(items: DeliveryRow[]) {
  const first = items[0];
  const links = items.map((item) => `${appUrl()}/operations?alert=${encodeURIComponent(item.alert_id)}`);
  const list = items.map((item, index) => `<li><strong>${escape(item.subject_label)}</strong>: ${escape(item.summary)}<br/><a href="${links[index]}">Open in Ophanim</a> · <a href="${mapLink()}">Open map</a>${item.source_reference ? ` · <a href="${escape(item.source_reference)}">Provider source</a>` : ''}</li>`).join('');
  const summary = items.length === 1 ? first.summary : `${items.length} intelligence alerts require review.`;
  return {
    subject: items.length === 1 ? `Ophanim: ${first.title}` : `Ophanim digest: ${items.length} items require review`,
    text: `${summary}\n\n${items.map((item, index) => `${item.subject_label}: ${item.summary}\n${links[index]}\nSource: ${item.source_name}`).join('\n\n')}`,
    html: `<h2>Ophanim intelligence ${items.length === 1 ? 'alert' : 'digest'}</h2><p>${escape(summary)}</p><p>These are unverified operational indicators. Review before acting.</p><h3>Affected entities</h3><ul>${list}</ul><p>Provider sources are linked where available. No raw source content is included in this email.</p>`,
  };
}

export async function sendPendingIntelligenceDeliveries() {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) return { sent: 0, skipped: true };
  const pending = await db().query<DeliveryRow>(
    `select delivery.id, delivery.setting_id, delivery.kind, delivery.attempts, setting.email, setting.digest_minutes,
            alert.id as alert_id, alert.alert_category, alert.title, alert.summary, assessment.confidence_score,
            assessment.subject_label, mention.source_name, mention.source_reference
       from ophanim_intelligence_deliveries delivery
       join ophanim_intelligence_notification_settings setting on setting.id = delivery.setting_id
       join ophanim_intelligence_alerts alert on alert.id = delivery.alert_id
       join ophanim_signal_assessments assessment on assessment.id = alert.assessment_id
       join ophanim_dark_web_mentions mention on mention.id = assessment.mention_id
      where delivery.status = 'pending' and delivery.next_attempt_at <= now() and setting.enabled
      order by delivery.created_at asc limit 100`,
  );
  const grouped = new Map<string, DeliveryRow[]>();
  for (const row of pending.rows) {
    const key = row.kind === 'digest' ? `digest:${row.setting_id}` : `immediate:${row.id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  for (const items of grouped.values()) {
    const content = message(items);
    try {
      const response = await resend.emails.send({ from: process.env.RESEND_FROM, to: [items[0].email], subject: content.subject, text: content.text, html: content.html });
      if (response.error) throw new Error(response.error.message);
      await db().query(`update ophanim_intelligence_deliveries set status = 'sent', attempts = attempts + 1, resend_id = $2, sent_at = now() where id = any($1::uuid[])`, [items.map((item) => item.id), response.data?.id ?? null]);
      if (items[0].kind === 'digest') await db().query(`update ophanim_intelligence_notification_settings set next_digest_at = now() + (digest_minutes || ' minutes')::interval, updated_at = now() where id = $1`, [items[0].setting_id]);
      sent += items.length;
    } catch (error) {
      for (const item of items) {
        const attempts = item.attempts + 1;
        await db().query(`update ophanim_intelligence_deliveries set attempts = $2, status = $3, error = $4, next_attempt_at = now() + ($5 || ' minutes')::interval where id = $1`, [item.id, attempts, attempts >= 5 ? 'failed' : 'pending', error instanceof Error ? error.message : 'Delivery failed.', String(Math.min(360, 5 * 2 ** attempts))]);
      }
    }
  }
  return { sent, skipped: false };
}
