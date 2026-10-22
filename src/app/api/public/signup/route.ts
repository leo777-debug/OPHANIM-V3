import { NextResponse } from 'next/server';
import { insertMarketingRecord, MarketingSubmissionError } from '@/lib/marketing/supabase';
import { cleanText, isEmail, isRateLimited, MarketingInputError, optionalText, readMarketingBody, requestIp } from '@/lib/marketing/validation';

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 12_000) return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
  if (isRateLimited(`signup:${requestIp(request)}`)) return NextResponse.json({ error: 'Please wait before trying again.' }, { status: 429 });
  try {
    const body = await readMarketingBody(request, 12_000);
    if (cleanText(body.website, 200)) return NextResponse.json({ ok: true });
    const name = cleanText(body.name, 120);
    const email = cleanText(body.email, 254).toLowerCase();
    const companyName = optionalText(body.companyName, 160);
    const phone = cleanText(body.phone, 40);
    if (name.length < 2 || !isEmail(email) || phone.length < 5) return NextResponse.json({ error: 'Please check the required fields.' }, { status: 400 });
    await insertMarketingRecord('ophanim_access_requests', { name, email, company_name: companyName, phone, source: 'landing_page' });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof MarketingInputError || error instanceof MarketingSubmissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Access request submission failed');
    return NextResponse.json({ error: 'Unable to save the request.' }, { status: 500 });
  }
}
