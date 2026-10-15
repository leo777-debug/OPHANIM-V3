import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { db } from '@/lib/watchlists/db';
import { limitedRequestBytes, RequestBodyLimitError } from '@/lib/http/limited-form-data';
import type { PoolClient } from 'pg';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook verification is not configured.' }, { status: 503 });
  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!id || !timestamp || !signature) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  let event;
  try {
    const payload = Buffer.from(await limitedRequestBytes(request, 256 * 1024)).toString('utf8');
    // Verification is local in the existing SDK; no email/API call is made.
    event = new Resend('webhook-verification-only').webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret: secret });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyLimitError ? 'Webhook body is too large.' : 'Invalid webhook signature.' }, { status: error instanceof RequestBodyLimitError ? 413 : 401 });
  }
  let client: PoolClient;
  try { client = await db().connect(); }
  catch { return NextResponse.json({ error: 'Webhook storage unavailable.' }, { status: 503 }); }
  try {
    await client.query('begin');
    const stored = await client.query('insert into ophanim_delivery_events(svix_id,resend_id,event_type,payload) values($1,$2,$3,$4) on conflict(svix_id) do nothing returning svix_id', [id, 'email_id' in event.data ? event.data.email_id : null, event.type, JSON.stringify(event)]);
    if (stored.rowCount && ['email.bounced', 'email.complained', 'email.suppressed'].includes(event.type)) {
      const recipients = 'to' in event.data ? event.data.to : undefined;
      if (Array.isArray(recipients) && typeof recipients[0] === 'string') await client.query('update ophanim_email_subscriptions set enabled=false where email=$1', [recipients[0]]);
    }
    await client.query('commit');
    return NextResponse.json({ ok: true });
  } catch {
    await client.query('rollback').catch(() => {});
    return NextResponse.json({ error: 'Webhook storage unavailable.' }, { status: 503 });
  } finally { client.release(); }
}
