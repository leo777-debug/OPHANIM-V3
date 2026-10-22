// Daily digest of the Today list by email (Resend, central keys) or WhatsApp.
// With no keys it returns the text only (stub) and sends nothing.
import { Resend } from 'resend';
import { rankToday } from './today-list';
import type { Ctx } from './types';

export async function buildDigest(ctx: Ctx) {
  const items = (await rankToday(ctx, { scope: 'team', persist: false })).items.slice(0, 15);
  const lines = items.map((item, index) => `${index + 1}. ${item.titleEn}${item.dueAt ? ` (due ${item.dueAt.slice(0, 16).replace('T', ' ')} UTC)` : ''}`);
  const subject = `Ophanim Today: ${items.length} item${items.length === 1 ? '' : 's'}${ctx.actor.demo ? ' [SYNTHETIC DEMO]' : ''}`;
  return { subject, text: lines.length ? `${lines.join('\n')}\n\nOpen the Today list for details.` : 'Nothing waiting today.', count: items.length };
}

export async function sendDigest(ctx: Ctx, recipients: { emails: string[]; whatsapp: string[] }, env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch) {
  const digest = await buildDigest(ctx), sent = { email: 0, whatsapp: 0 }, stub: string[] = [];
  if (env.RESEND_API_KEY && env.RESEND_FROM && recipients.emails.length) {
    const resend = new Resend(env.RESEND_API_KEY);
    for (const to of recipients.emails.slice(0, 50)) { const result = await resend.emails.send({ from: env.RESEND_FROM, to, subject: digest.subject, text: digest.text }); if (!result.error) sent.email++; }
  } else stub.push('email (set RESEND_API_KEY and RESEND_FROM)');
  if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && recipients.whatsapp.length) {
    // Free-form text only reaches people inside WhatsApp's 24-hour service window; use an approved template otherwise.
    for (const to of recipients.whatsapp.slice(0, 50)) {
      const response = await fetcher(`https://graph.facebook.com/v21.0/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID)}/messages`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: `${digest.subject}\n\n${digest.text}`.slice(0, 4000) } }) });
      if (response.ok) sent.whatsapp++;
    }
  } else stub.push('WhatsApp (set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID)');
  return { ...digest, sent, stub };
}
