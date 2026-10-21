import { NextResponse, type NextRequest } from 'next/server';
import { cronAuthorized, headers, jobError, systemContext } from '@/lib/jobfile/context';
import { textOf } from '@/lib/jobfile/intake/text';
import { fetchUnseen, imapConfig, markSeen } from '@/lib/jobfile/intake/imap';
import { parseEmail } from '@/lib/jobfile/intake/mime';
import { receiveAndProcess } from '@/lib/jobfile/paper-desk';
export const dynamic = 'force-dynamic';

/** Cron: poll the one dedicated IMAP mailbox that belongs to IMAP_ORGANIZATION_ID. */
export async function POST(request: NextRequest) {
  try {
    if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers });
    const config = imapConfig(), organizationId = process.env.IMAP_ORGANIZATION_ID;
    if (!config || !organizationId) return NextResponse.json({ status: 'stub', message: 'IMAP is not configured. Set IMAP_HOST, IMAP_USER, IMAP_PASSWORD and IMAP_ORGANIZATION_ID.' }, { headers });
    const ctx = await systemContext(organizationId), processed: number[] = [], results = [];
    for (const message of await fetchUnseen(config)) {
      const email = parseEmail(message.raw);
      const result = await receiveAndProcess(ctx, { channel: 'email', externalId: email.messageId ?? `imap-uid-${message.uid}`, sender: email.from, subject: email.subject, bodyText: email.text, receivedAt: email.date ?? undefined,
        attachments: email.attachments.slice(0, 20).map(item => ({ ...item, text: textOf(item) })) });
      processed.push(message.uid); results.push({ uid: message.uid, status: result.intake.status });
    }
    await markSeen(config, processed);
    return NextResponse.json({ status: 'ok', processed: results }, { headers });
  } catch (error) { return jobError(error); }
}
