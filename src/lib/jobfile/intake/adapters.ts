// Intake adapters: inbound-email webhook, IMAP mailbox and WhatsApp Business.
// All return the same IntakeInput so matching and storage are shared.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { textOf } from './text';
import type { IntakeInput } from '../service';
import { parseEmail } from './mime';

const safeEqual = (a: string, b: string) => { const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); };

// ---- Per-organization inbound address -------------------------------------------
/** jobs+<organization uuid>.<10-hex signature>@INBOUND_EMAIL_DOMAIN. The signature stops guessing another tenant's address. */
export function inboundAddress(organizationId: string, env: NodeJS.ProcessEnv = process.env) {
  if (!env.INBOUND_EMAIL_SECRET || !env.INBOUND_EMAIL_DOMAIN) return null;
  return `jobs+${organizationId}.${createHmac('sha256', env.INBOUND_EMAIL_SECRET).update(organizationId).digest('hex').slice(0, 10)}@${env.INBOUND_EMAIL_DOMAIN}`;
}
export function organizationFromRecipients(recipients: string[], env: NodeJS.ProcessEnv = process.env): string | null {
  for (const recipient of recipients) {
    const match = recipient.toLowerCase().match(/jobs\+([0-9a-f-]{36})\.([0-9a-f]{10})@/);
    if (match && env.INBOUND_EMAIL_SECRET && safeEqual(match[2], createHmac('sha256', env.INBOUND_EMAIL_SECRET).update(match[1]).digest('hex').slice(0, 10))) return match[1];
  }
  return null;
}

// ---- Inbound webhook (generic JSON, Postmark-style or raw MIME) -----------------
export function verifyInboundSecret(header: string | null, env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.INBOUND_EMAIL_SECRET && header && safeEqual(header.replace(/^Bearer\s+/i, ''), env.INBOUND_EMAIL_SECRET));
}
type Json = Record<string, unknown>;
const str = (value: unknown) => typeof value === 'string' ? value : null;
export function parseInboundWebhook(body: unknown): { input: IntakeInput; recipients: string[] } {
  const value = (body && typeof body === 'object' ? body : {}) as Json;
  if (typeof value.raw === 'string') {
    const email = parseEmail(Buffer.from(value.raw, value.encoding === 'base64' ? 'base64' : 'utf8'));
    return { recipients: email.to, input: { channel: 'email', externalId: email.messageId, sender: email.from, subject: email.subject, bodyText: email.text, receivedAt: email.date ?? undefined,
      attachments: email.attachments.map(item => ({ fileName: item.fileName, mimeType: item.mimeType, bytes: item.bytes, text: textOf(item) })) } };
  }
  const list = (value.attachments ?? value.Attachments) as Json[] | undefined;
  const recipients = [str(value.to) ?? str(value.To) ?? '', ...((value.ToFull as Json[] | undefined) ?? []).map(item => str(item.Email) ?? '')].flatMap(item => item.split(',')).map(item => item.trim()).filter(Boolean);
  return { recipients, input: {
    channel: 'email', externalId: str(value.messageId) ?? str(value.MessageID), sender: str(value.from) ?? str(value.From), subject: str(value.subject) ?? str(value.Subject),
    bodyText: str(value.text) ?? str(value.TextBody) ?? '', receivedAt: undefined,
    attachments: (Array.isArray(list) ? list : []).slice(0, 20).map(item => {
      const attachment = { fileName: str(item.filename) ?? str(item.Name) ?? 'attachment', mimeType: (str(item.contentType) ?? str(item.ContentType) ?? 'application/octet-stream').split(';')[0], bytes: Buffer.from(str(item.content) ?? str(item.Content) ?? '', 'base64') };
      return { ...attachment, text: textOf(attachment) };
    }),
  } };
}

// ---- WhatsApp Business (Cloud API) ---------------------------------------------
export const whatsappConfigured = (env: NodeJS.ProcessEnv = process.env) => Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_APP_SECRET && env.WHATSAPP_VERIFY_TOKEN && env.WHATSAPP_ORGANIZATION_ID);
export function verifyWhatsappChallenge(params: URLSearchParams, env: NodeJS.ProcessEnv = process.env) {
  return params.get('hub.mode') === 'subscribe' && env.WHATSAPP_VERIFY_TOKEN && safeEqual(params.get('hub.verify_token') ?? '', env.WHATSAPP_VERIFY_TOKEN) ? params.get('hub.challenge') : null;
}
export function verifyWhatsappSignature(rawBody: string, signature: string | null, env: NodeJS.ProcessEnv = process.env) {
  if (!env.WHATSAPP_APP_SECRET || !signature?.startsWith('sha256=')) return false;
  return safeEqual(signature.slice(7), createHmac('sha256', env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex'));
}
export type WhatsappMessage = { id: string; from: string; timestamp: string | null; text: string; media: Array<{ id: string; mimeType: string; fileName: string; caption: string }> };
export function parseWhatsappWebhook(body: unknown): WhatsappMessage[] {
  const entries = ((body as Json)?.entry as Json[] | undefined) ?? [];
  return entries.flatMap(entry => ((entry.changes as Json[] | undefined) ?? []).flatMap(change => (((change.value as Json)?.messages as Json[] | undefined) ?? []).map(message => {
    const media = (['image', 'document'] as const).flatMap(kind => message[kind] ? [{ id: str((message[kind] as Json).id) ?? '', mimeType: str((message[kind] as Json).mime_type) ?? (kind === 'image' ? 'image/jpeg' : 'application/pdf'), fileName: str((message[kind] as Json).filename) ?? `${kind}-${str(message.id) ?? 'whatsapp'}.${kind === 'image' ? 'jpg' : 'pdf'}`, caption: str((message[kind] as Json).caption) ?? '' }] : []);
    return { id: str(message.id) ?? '', from: str(message.from) ?? '', timestamp: str(message.timestamp), text: str((message.text as Json)?.body) ?? media.map(item => item.caption).join(' '), media };
  })));
}
/** Download WhatsApp media with the server-held token. Without keys this is never called (stub mode). */
export async function downloadWhatsappMedia(id: string, env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch) {
  if (!/^\d{5,30}$/.test(id) || !env.WHATSAPP_ACCESS_TOKEN) throw new Error('WhatsApp media unavailable.');
  const auth = { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` };
  const meta = await fetcher(`https://graph.facebook.com/v21.0/${id}`, { headers: auth, redirect: 'error', signal: AbortSignal.timeout(10000) });
  const url = str(((await meta.json()) as Json).url);
  if (!url || !/^https:\/\/[a-z0-9.-]+\.(fbcdn\.net|whatsapp\.net|facebook\.com)\//i.test(url)) throw new Error('Unexpected WhatsApp media location.');
  const file = await fetcher(url, { headers: auth, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (Number(file.headers.get('content-length') ?? 0) > 10 * 1024 * 1024) throw new Error('WhatsApp media too large.');
  return Buffer.from(await file.arrayBuffer());
}
export function whatsappIntake(message: WhatsappMessage, files: Array<{ fileName: string; mimeType: string; bytes: Buffer }>): IntakeInput {
  return { channel: 'whatsapp', externalId: message.id, sender: message.from, subject: null, bodyText: message.text,
    receivedAt: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : undefined, attachments: files.map(file => ({ ...file, text: textOf(file) })) };
}
