import net from 'node:net';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { inboundAddress, organizationFromRecipients, parseInboundWebhook, parseWhatsappWebhook, verifyInboundSecret, verifyWhatsappChallenge, verifyWhatsappSignature } from './adapters';
import { fetchUnseen, markSeen } from './imap';
import { parseEmail } from './mime';

const ORG = '5e7d0000-0000-4000-8000-000000000001';
const env = { INBOUND_EMAIL_SECRET: 'synthetic-inbound-secret', INBOUND_EMAIL_DOMAIN: 'inbound.example.test' } as unknown as NodeJS.ProcessEnv;
const raw = [
  'Message-ID: <pre-alert-1@origin.example>', 'From: =?utf-8?B?T3JpZ2luIEFnZW50?= <agent@origin.example>', `To: ${inboundAddress(ORG, env)}`,
  'Subject: PRE-ALERT MAWB 176-12345675', 'Date: Tue, 20 Oct 2026 08:00:00 +0400', 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="b1"', '',
  '--b1', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: quoted-printable', '', 'Dear team, 12 pcs / 1240 kg, ETA =\r\nDXB 24 Oct.', '',
  '--b1', 'Content-Type: application/pdf; name="MAWB.pdf"', 'Content-Disposition: attachment; filename="MAWB.pdf"', 'Content-Transfer-Encoding: base64', '',
  Buffer.from('%PDF-1.4\nBT (AIR WAYBILL 176-12345675) Tj ET').toString('base64'), '--b1--', '',
].join('\r\n');

describe('email intake', () => {
  it('parses MIME parts, encodings and attachments', () => {
    const email = parseEmail(raw);
    expect(email).toMatchObject({ messageId: 'pre-alert-1@origin.example', subject: 'PRE-ALERT MAWB 176-12345675', from: 'Origin Agent <agent@origin.example>' });
    expect(email.text).toContain('ETA DXB 24 Oct');
    expect(email.attachments).toHaveLength(1); expect(email.attachments[0]).toMatchObject({ fileName: 'MAWB.pdf', mimeType: 'application/pdf' });
  });
  it('routes signed per-organization addresses and rejects forged ones', () => {
    expect(organizationFromRecipients([inboundAddress(ORG, env)!], env)).toBe(ORG);
    expect(organizationFromRecipients([`jobs+${ORG}.0000000000@inbound.example.test`], env)).toBeNull();
    expect(verifyInboundSecret('Bearer synthetic-inbound-secret', env)).toBe(true); expect(verifyInboundSecret('wrong', env)).toBe(false); expect(verifyInboundSecret('x', {} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
  it('accepts Postmark-style JSON and raw MIME webhooks with attachment text', () => {
    const json = parseInboundWebhook({ From: 'a@b.test', To: 'jobs@x', Subject: 'Pre-alert', TextBody: 'hi', MessageID: 'm1', Attachments: [{ Name: 'n.txt', ContentType: 'text/plain', Content: Buffer.from('AWB 176-12345675').toString('base64') }] });
    expect(json.input.attachments[0].text).toBe('AWB 176-12345675');
    const mime = parseInboundWebhook({ raw: Buffer.from(raw).toString('base64'), encoding: 'base64' });
    expect(mime.input.attachments[0].text).toContain('176-12345675'); expect(mime.input.externalId).toBe('pre-alert-1@origin.example');
  });
  it('polls an IMAP mailbox over a real socket and marks messages seen', async () => {
    const commands: string[] = [];
    const server = net.createServer(socket => {
      socket.write('* OK synthetic IMAP ready\r\n');
      socket.on('data', chunk => { for (const line of chunk.toString().split('\r\n').filter(Boolean)) {
        commands.push(line); const [tag, ...rest] = line.split(' '), cmd = rest.join(' ');
        if (cmd.startsWith('UID SEARCH')) socket.write(`* SEARCH 7\r\n${tag} OK done\r\n`);
        else if (cmd.startsWith('UID FETCH')) socket.write(`* 1 FETCH (UID 7 BODY[] {${Buffer.byteLength(raw)}}\r\n${raw})\r\n${tag} OK done\r\n`);
        else if (cmd === 'LOGOUT') { socket.write(`* BYE\r\n${tag} OK bye\r\n`); socket.end(); }
        else socket.write(`${tag} OK done\r\n`);
      } });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const config = { host: '127.0.0.1', port: (server.address() as net.AddressInfo).port, secure: false, user: 'jobs', password: 'synthetic "pw"' };
      const messages = await fetchUnseen(config);
      expect(messages.map(message => message.uid)).toEqual([7]);
      expect(parseEmail(messages[0].raw).subject).toBe('PRE-ALERT MAWB 176-12345675');
      expect(commands).toContain('A1 LOGIN "jobs" "synthetic \\"pw\\""');
      await markSeen(config, [7]);
      expect(commands).toContain('A3 UID STORE 7 +FLAGS (\\Seen)');
    } finally { server.close(); }
  });
});

describe('WhatsApp intake', () => {
  const wa = { WHATSAPP_VERIFY_TOKEN: 'synthetic-verify', WHATSAPP_APP_SECRET: 'synthetic-app-secret' } as unknown as NodeJS.ProcessEnv;
  it('answers the verification challenge only with the right token', () => {
    expect(verifyWhatsappChallenge(new URLSearchParams('hub.mode=subscribe&hub.verify_token=synthetic-verify&hub.challenge=42'), wa)).toBe('42');
    expect(verifyWhatsappChallenge(new URLSearchParams('hub.mode=subscribe&hub.verify_token=no&hub.challenge=42'), wa)).toBeNull();
  });
  it('verifies signatures and parses text and photo messages', () => {
    const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [
      { id: 'wamid.1', from: '971500000000', timestamp: '1792900000', type: 'text', text: { body: 'AWB 176-12345675 landed?' } },
      { id: 'wamid.2', from: '971500000000', timestamp: '1792900001', type: 'image', image: { id: '1234567890', mime_type: 'image/jpeg', caption: 'DO for 176-12345675' } },
    ] } }] }] });
    expect(verifyWhatsappSignature(body, `sha256=${createHmac('sha256', 'synthetic-app-secret').update(body).digest('hex')}`, wa)).toBe(true);
    expect(verifyWhatsappSignature(body, 'sha256=00', wa)).toBe(false);
    const messages = parseWhatsappWebhook(JSON.parse(body));
    expect(messages.map(message => message.text)).toEqual(['AWB 176-12345675 landed?', 'DO for 176-12345675']);
    expect(messages[1].media[0]).toMatchObject({ id: '1234567890', mimeType: 'image/jpeg' });
  });
});
