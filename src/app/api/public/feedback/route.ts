import { NextResponse } from 'next/server';
import { insertMarketingRecord } from '@/lib/marketing/supabase';
import { cleanText, isEmail, isRateLimited, optionalText, requestIp } from '@/lib/marketing/validation';

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 16_000) return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
  if (isRateLimited(`feedback:${requestIp(request)}`, 8)) return NextResponse.json({ error: 'Please wait before trying again.' }, { status: 429 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (cleanText(body.website, 200)) return NextResponse.json({ ok: true });
    const name = optionalText(body.name, 120);
    const emailValue = cleanText(body.email, 254).toLowerCase();
    const email = emailValue || null;
    const message = cleanText(body.message, 3000);
    if ((email && !isEmail(email)) || message.length < 3) return NextResponse.json({ error: 'Please check the feedback fields.' }, { status: 400 });
    await insertMarketingRecord('ophanim_feedback', { name, email, message, source: 'landing_page' });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error('Feedback submission failed', error);
    return NextResponse.json({ error: 'Unable to save the feedback.' }, { status: 500 });
  }
}
