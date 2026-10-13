import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '@/lib/db/pool';
import type { OrganizationActor } from '@/lib/operations/types';
import type { ArticleSnapshot } from './url-fetch';
import type { VerifyResult } from './types';

export type SharedResult = Omit<VerifyResult, 'id' | 'previousId' | 'aiSummary' | 'inputUrl'>;
export function publicSnapshot(result: VerifyResult): SharedResult {
  // Positive whitelist: never serialize a database row, actor, article text or private metadata.
  return { claim: { text: result.claim.text, type: result.claim.type, place: { name: result.claim.place.name, latitude: result.claim.place.latitude, longitude: result.claim.place.longitude, ...(result.claim.place.code ? { code: result.claim.place.code } : {}) }, start: result.claim.start, end: result.claim.end, entities: [...result.claim.entities], expectedObservation: result.claim.expectedObservation, minimumMagnitude: result.claim.minimumMagnitude },
    verdict: result.verdict, summary: result.summary, checkedAt: result.checkedAt, mode: result.mode,
    ...(result.replay ? { replay: { fixture: result.replay.fixture, recordedAt: result.replay.recordedAt, provenance: result.replay.provenance } } : {}),
    evidence: result.evidence.map((item) => ({ id: item.id, source: item.source, sourceUrl: item.sourceUrl, independenceKey: item.independenceKey, trust: item.trust, observedAt: item.observedAt, fetchedAt: item.fetchedAt, stance: item.stance, aspect: item.aspect, statement: item.statement })),
    checked: [...result.checked], couldNotCheck: result.couldNotCheck.map((item) => ({ source: item.source, reason: item.reason })) };
}
const ttl = 30 * 60 * 1000;
const temporary = new Map<string, { owner: string; result: VerifyResult; article: ArticleSnapshot | null; expires: number }>();
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const shareDirectory = join(tmpdir(), `ophanim-verify-shares-${hash(process.cwd()).slice(0, 16)}`);
type TemporaryShare = { ownerHash: string; snapshot: SharedResult; expires: number };
async function temporaryShare(token: string): Promise<TemporaryShare | null> {
  try { const item = JSON.parse(await readFile(join(shareDirectory, `${hash(token)}.json`), 'utf8')) as TemporaryShare;
    if (item.expires <= Date.now()) { await unlink(join(shareDirectory, `${hash(token)}.json`)); return null; }
    return item;
  } catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null; throw error; }
}
async function writeTemporaryShare(token: string, item: TemporaryShare) {
  // Public-consent snapshots only. Temp files bridge Next's API/RSC contexts, not server instances.
  await mkdir(shareDirectory, { recursive: true, mode: 0o700 });
  const files = await readdir(shareDirectory);
  for (const file of files) {
    if (!/^[0-9a-f]{64}\.json$/.test(file)) continue;
    try { const entry = JSON.parse(await readFile(join(shareDirectory, file), 'utf8')) as TemporaryShare; if (entry.expires <= Date.now()) await unlink(join(shareDirectory, file)); } catch { /* A concurrent revocation may remove this entry. */ }
  }
  if ((await readdir(shareDirectory)).length >= 1000) throw new Error('Temporary share capacity reached; configure the database.');
  await writeFile(join(shareDirectory, `${hash(token)}.json`), JSON.stringify(item), { mode: 0o600, flag: 'wx' });
}
function cleanup() {
  for (const [key, entry] of temporary) if (entry.expires <= Date.now()) temporary.delete(key);
  while (temporary.size >= 1000) temporary.delete(temporary.keys().next().value!);
}
export function remember(result: VerifyResult, owner: string, article: ArticleSnapshot | null = null) { cleanup(); temporary.set(result.id, { owner, result, article, expires: Date.now() + ttl }); }
export async function saveRun(result: VerifyResult, actor: OrganizationActor | null, article: ArticleSnapshot | null) {
  if (!actor || !process.env.DATABASE_URL) return false;
  await db().query('insert into ophanim_verify_runs (id, organization_id, user_id, previous_id, result, article_snapshot, checked_at) values ($1,$2,$3,$4,$5,$6,$7)', [result.id, actor.organizationId, actor.userId, result.previousId ?? null, JSON.stringify(result), article ? JSON.stringify(article) : null, result.checkedAt]);
  return true;
}
export async function readRun(id: string, actor: OrganizationActor | null, owner: string): Promise<VerifyResult | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  if (actor && process.env.DATABASE_URL) {
    const rows = await db().query<{ result: VerifyResult }>('select result from ophanim_verify_runs where id=$1 and organization_id=$2 and user_id=$3', [id, actor.organizationId, actor.userId]);
    if (rows.rows[0]) return rows.rows[0].result;
  }
  cleanup(); const item = temporary.get(id);
  return item?.owner === owner ? item.result : null;
}
export async function history(actor: OrganizationActor) {
  const rows = await db().query<{ result: VerifyResult }>('select result from ophanim_verify_runs where organization_id=$1 and user_id=$2 order by checked_at desc limit 50', [actor.organizationId, actor.userId]);
  return rows.rows.map((row) => row.result);
}
export async function createShare(result: VerifyResult, actor: OrganizationActor | null, owner: string) {
  const token = randomBytes(32).toString('hex'), snapshot = publicSnapshot(result);
  const expires = new Date(Date.now() + (actor ? 30 * 86400000 : ttl)).toISOString();
  if (actor && process.env.DATABASE_URL) {
    await db().query('insert into ophanim_verify_shares (organization_id,user_id,run_id,token_hash,snapshot,expires_at) values ($1,$2,$3,$4,$5,$6)', [actor.organizationId, actor.userId, result.id, hash(token), JSON.stringify(snapshot), expires]);
    return { token, expires, temporary: false };
  }
  await writeTemporaryShare(token, { ownerHash: hash(owner), snapshot, expires: Date.now() + ttl });
  return { token, expires, temporary: true };
}
export async function readShare(token: string): Promise<SharedResult | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  if (process.env.DATABASE_URL) {
    const rows = await db().query<{ snapshot: SharedResult }>('select snapshot from ophanim_verify_shares where token_hash=$1 and revoked_at is null and expires_at > now()', [hash(token)]);
    if (rows.rows[0]) return rows.rows[0].snapshot;
  }
  return (await temporaryShare(token))?.snapshot ?? null;
}
export async function revokeShare(token: string, actor: OrganizationActor | null, owner: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Invalid share token.');
  if (actor && process.env.DATABASE_URL) await db().query('update ophanim_verify_shares set revoked_at=now() where token_hash=$1 and organization_id=$2 and user_id=$3', [hash(token), actor.organizationId, actor.userId]);
  const item = await temporaryShare(token); if (item?.ownerHash === hash(owner)) await unlink(join(shareDirectory, `${hash(token)}.json`));
}
