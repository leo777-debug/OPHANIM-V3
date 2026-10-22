// Minimal IMAP poller for one dedicated mailbox (works self-hosted, no provider).
// LOGIN → SELECT INBOX → UID SEARCH UNSEEN → UID FETCH BODY.PEEK[] → mark \Seen.
import net from 'node:net';
import tls from 'node:tls';

export type ImapConfig = { host: string; port: number; secure: boolean; user: string; password: string; mailbox?: string; maxMessages?: number; timeoutMs?: number };
export function imapConfig(env: NodeJS.ProcessEnv = process.env): ImapConfig | null {
  if (!env.IMAP_HOST || !env.IMAP_USER || !env.IMAP_PASSWORD) return null;
  const secure = env.IMAP_TLS !== 'false';
  return { host: env.IMAP_HOST, port: Number(env.IMAP_PORT || (secure ? 993 : 143)), secure, user: env.IMAP_USER, password: env.IMAP_PASSWORD, mailbox: env.IMAP_MAILBOX || 'INBOX', maxMessages: 25 };
}

const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export async function fetchUnseen(config: ImapConfig): Promise<Array<{ uid: number; raw: Buffer }>> {
  const socket = config.secure ? tls.connect({ host: config.host, port: config.port, servername: config.host }) : net.connect({ host: config.host, port: config.port });
  socket.setTimeout(config.timeoutMs ?? 20000);
  let buffer = Buffer.alloc(0), waiter: (() => void) | null = null, failure: Error | null = null;
  socket.on('data', chunk => { buffer = Buffer.concat([buffer, chunk]); waiter?.(); });
  socket.on('error', error => { failure = error; waiter?.(); });
  socket.on('timeout', () => { failure = new Error('IMAP timeout'); socket.destroy(); waiter?.(); });
  const wait = () => new Promise<void>(resolve => { waiter = () => { waiter = null; resolve(); }; });
  /** Read until a line matching `done` has arrived; literals {n} are consumed whole. */
  async function readUntil(done: RegExp) {
    for (;;) {
      if (failure) throw failure;
      const textView = buffer.toString('latin1'); let position = 0, complete = false;
      for (;;) {
        const end = textView.indexOf('\r\n', position); if (end < 0) break;
        const line = textView.slice(position, end), literal = line.match(/\{(\d+)\}$/);
        if (literal) { const after = end + 2 + Number(literal[1]); if (after > buffer.length) break; position = after; continue; }
        position = end + 2;
        if (done.test(line)) { complete = true; break; }
      }
      if (complete) { const result = buffer.subarray(0, position); buffer = buffer.subarray(position); return result; }
      await wait();
    }
  }
  let tag = 0;
  async function command(line: string) {
    const id = `A${++tag}`; socket.write(`${id} ${line}\r\n`);
    const response = await readUntil(new RegExp(`^${id} (OK|NO|BAD)`));
    const status = response.toString('latin1').match(new RegExp(`${id} (OK|NO|BAD)[^\\r]*`))?.[0] ?? '';
    if (!status.includes(' OK')) throw new Error(`IMAP command failed: ${line.split(' ')[0]}`);
    return response;
  }
  try {
    await readUntil(/^\* (OK|PREAUTH)/);
    await command(`LOGIN ${quote(config.user)} ${quote(config.password)}`);
    await command(`SELECT ${quote(config.mailbox ?? 'INBOX')}`);
    const search = (await command('UID SEARCH UNSEEN')).toString('latin1').match(/^\* SEARCH([\d ]*)/m)?.[1] ?? '';
    const uids = search.trim().split(/\s+/).filter(Boolean).map(Number).slice(0, config.maxMessages ?? 25);
    const messages: Array<{ uid: number; raw: Buffer }> = [];
    for (const uid of uids) {
      const response = await command(`UID FETCH ${uid} (BODY.PEEK[])`);
      const header = response.toString('latin1').match(/BODY\[\] \{(\d+)\}\r\n/);
      if (!header) continue;
      const start = response.toString('latin1').indexOf(header[0]) + header[0].length;
      messages.push({ uid, raw: Buffer.from(response.subarray(start, start + Number(header[1]))) });
    }
    return messages;
  } finally { socket.end(); }
}

/** Mark processed messages as seen after they are safely stored. */
export async function markSeen(config: ImapConfig, uids: number[]) {
  if (!uids.length) return;
  const socket = config.secure ? tls.connect({ host: config.host, port: config.port, servername: config.host }) : net.connect({ host: config.host, port: config.port });
  await new Promise<void>((resolve, reject) => {
    let stage = 0; const lines = [`A1 LOGIN ${quote(config.user)} ${quote(config.password)}`, `A2 SELECT ${quote(config.mailbox ?? 'INBOX')}`, `A3 UID STORE ${uids.join(',')} +FLAGS (\\Seen)`, 'A4 LOGOUT'];
    let text = '';
    socket.setTimeout(config.timeoutMs ?? 20000, () => { socket.destroy(); reject(new Error('IMAP timeout')); });
    socket.on('error', reject);
    socket.on('data', chunk => {
      text += chunk.toString('latin1');
      if (stage === 0 && /^\* (OK|PREAUTH)/m.test(text)) { socket.write(`${lines[0]}\r\n`); stage = 1; }
      for (let index = 1; index <= 4; index++) if (stage === index && new RegExp(`^A${index} (OK|NO|BAD)`, 'm').test(text)) {
        if (!new RegExp(`^A${index} OK`, 'm').test(text) && index < 4) { socket.destroy(); reject(new Error('IMAP command failed')); return; }
        if (index < 4) { socket.write(`${lines[index]}\r\n`); stage = index + 1; } else { socket.end(); resolve(); }
      }
    });
  });
}
