import { NextResponse, type NextRequest } from 'next/server';
import { headers, jobError, systemContext } from '@/lib/jobfile/context';
import { downloadWhatsappMedia, parseWhatsappWebhook, verifyWhatsappChallenge, verifyWhatsappSignature, whatsappConfigured, whatsappIntake } from '@/lib/jobfile/intake/adapters';
import { receiveIntake } from '@/lib/jobfile/service';
export const dynamic = 'force-dynamic';

/** WhatsApp Business Cloud API webhook verification. */
export function GET(request: NextRequest) {
  const challenge = verifyWhatsappChallenge(request.nextUrl.searchParams);
  return challenge ? new NextResponse(challenge, { headers: { 'Content-Type': 'text/plain' } }) : NextResponse.json({ error: 'Verification failed.' }, { status: 403, headers });
}

/** Messages and photos sent to the business number become intake items. Without keys: stub mode (forward in the app instead). */
export async function POST(request: NextRequest) {
  try {
    if (!whatsappConfigured()) return NextResponse.json({ status: 'stub', message: 'WhatsApp is not configured. Forward photos in the app, or set WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN and WHATSAPP_ORGANIZATION_ID.' }, { status: 503, headers });
    const raw = await request.text();
    if (raw.length > 1_000_000 || !verifyWhatsappSignature(raw, request.headers.get('x-hub-signature-256'))) return NextResponse.json({ error: 'Invalid signature.' }, { status: 401, headers });
    const ctx = await systemContext(process.env.WHATSAPP_ORGANIZATION_ID!), results = [];
    for (const message of parseWhatsappWebhook(JSON.parse(raw)).slice(0, 20)) {
      const files = [];
      for (const media of message.media.slice(0, 5)) files.push({ fileName: media.fileName, mimeType: media.mimeType, bytes: await downloadWhatsappMedia(media.id) });
      results.push((await receiveIntake(ctx, whatsappIntake(message, files))).intake.status);
    }
    return NextResponse.json({ status: 'ok', results }, { headers });
  } catch (error) { return jobError(error); }
}
