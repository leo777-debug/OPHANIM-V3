import { Resend } from 'resend';
import { db } from './db';
import { notificationLinks, type StoredWatchlist } from './service';

const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

export async function sendPendingNotifications() {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) return { sent: 0, skipped: true };

  const pending = (await db().query(`select n.*,s.email,w.public_id,w.entity_type,w.entity_value,w.label from ophanim_notifications n join ophanim_email_subscriptions s on s.id=n.subscription_id join ophanim_watchlists w on w.id=n.watchlist_id where n.status='pending' and n.next_attempt_at<=now() and s.verified_at is not null order by n.created_at limit 50`)).rows;
  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;

  for (const item of pending) {
    const row = item as StoredWatchlist & any;
    const links = notificationLinks(row, item.payload);
    const sources = links.sources.map((source) => String(source));
    const results = item.payload?.results || [];
    const summary = `${row.label || row.entity_value} has ${results.length} current provider result${results.length === 1 ? '' : 's'}.`;
    const html = `<h2>Ophanim watchlist alert</h2><p>${escape(summary)}</p><p><a href="${links.watchlist}">Open watchlist</a> | <a href="${links.entity}">Open entity</a> | <a href="${links.map}">Open map</a></p><h3>Affected entities</h3><ul>${results.slice(0, 10).map((result: any) => `<li>${escape(result.label || result.id || 'Result')}</li>`).join('')}</ul><p>Provider sources: ${sources.map(escape).join(', ') || 'No source returned'}</p>`;

    try {
      const response = await resend.emails.send({
        from: process.env.RESEND_FROM,
        to: [item.email],
        subject: `Ophanim: ${row.label || row.entity_value}`,
        html,
        text: `${summary}\n${links.watchlist}\n${links.entity}\n${links.map}\nSources: ${sources.join(', ')}`,
        headers: { 'X-Entity-Ref': row.public_id },
      });
      if (response.error) throw new Error(response.error.message);
      await db().query(`update ophanim_notifications set status='sent',attempts=attempts+1,resend_id=$2,sent_at=now() where id=$1`, [item.id, response.data?.id]);
      if (item.kind === 'digest') await db().query(`update ophanim_email_subscriptions set next_digest_at=now()+(digest_minutes||' minutes')::interval where id=$1`, [item.subscription_id]);
      sent += 1;
    } catch (error) {
      const attempts = Number(item.attempts) + 1;
      const terminal = attempts >= 5;
      await db().query(`update ophanim_notifications set attempts=$2,status=$3,error=$4,next_attempt_at=now()+($5||' minutes')::interval where id=$1`, [item.id, attempts, terminal ? 'failed' : 'pending', error instanceof Error ? error.message : 'Send failed', String(Math.min(360, 5 * 2 ** attempts))]);
    }
  }

  return { sent, skipped: false };
}

export async function sendVerification(email: string, token: string) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) throw new Error('Resend is not configured.');
  const url = `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/watchlists/verify/${token}`;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const response = await resend.emails.send({
    from: process.env.RESEND_FROM,
    to: [email],
    subject: 'Confirm Ophanim watchlist email',
    html: `<p>Confirm watchlist notifications: <a href="${url}">Confirm email</a></p>`,
    text: `Confirm watchlist notifications: ${url}`,
  });
  if (response.error) throw new Error(response.error.message);
}
