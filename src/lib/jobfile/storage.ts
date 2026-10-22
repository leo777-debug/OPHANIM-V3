// Private document and photo storage. Bytes never go to a public path; reads
// use short-lived signed URLs. Supabase Storage when configured, else the
// private KNOWLEDGE_STORAGE_DIR, else (demo only) process memory.
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { readPrivateFile, storePrivateFile } from './private-files';

const memory = ((globalThis as { __ophanimJobFiles?: Map<string, { bytes: Buffer; mime: string }> }).__ophanimJobFiles ??= new Map());
export const ALLOWED_UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'text/plain', 'message/rfc822', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

export function storageMode(demo: boolean) {
  if (createSupabaseAdminClient()) return 'supabase' as const;
  if (process.env.JOBFILE_STORAGE_DIR || process.env.KNOWLEDGE_STORAGE_DIR) return 'local' as const;
  return demo ? 'memory' as const : 'unavailable' as const;
}
export function storageKey(organizationId: string, jobOrIntake: string, fileName: string) {
  const safe = fileName.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'file';
  return `${organizationId}/jobfiles/${jobOrIntake}/${randomUUID()}-${safe}`;
}
export async function putFile(key: string, bytes: Buffer, mime: string, demo: boolean) {
  if (!ALLOWED_UPLOAD_TYPES.has(mime)) throw new Error('Unsupported file type.');
  if (bytes.length < 1 || bytes.length > MAX_UPLOAD_BYTES) throw new Error('Files must be between 1 byte and 10 MB.');
  const mode = storageMode(demo);
  if (mode === 'unavailable') throw new Error('Private storage is unavailable. Configure Supabase storage or JOBFILE_STORAGE_DIR.');
  if (mode === 'memory') memory.set(key, { bytes, mime }); else await storePrivateFile(key, bytes, mime);
}
export async function getFile(key: string, demo: boolean): Promise<Buffer> {
  if (storageMode(demo) === 'memory') { const item = memory.get(key); if (!item) throw new Error('Private file not found.'); return item.bytes; }
  return readPrivateFile(key);
}

const secret = () => process.env.JOBFILE_URL_SIGNING_SECRET || (process.env.DATABASE_URL ? '' : 'synthetic-demo-signing-key');
/** Signed URL valid for `seconds`. The route also re-checks the caller's organization. */
export async function signedUrl(key: string, demo: boolean, seconds = 300) {
  const admin = storageMode(demo) === 'supabase' ? createSupabaseAdminClient() : null;
  if (admin) { const { data, error } = await admin.storage.from('ophanim-private').createSignedUrl(key, seconds); if (!error && data?.signedUrl) return data.signedUrl; }
  if (!secret()) throw new Error('Set JOBFILE_URL_SIGNING_SECRET to serve private files.');
  const expires = Math.floor(Date.now() / 1000) + seconds;
  return `/api/jobfiles/file?key=${encodeURIComponent(key)}&expires=${expires}&signature=${createHmac('sha256', secret()).update(`${key}:${expires}`).digest('hex')}`;
}
export function verifySignature(key: string, expires: number, signature: string, now = Date.now()) {
  if (!secret() || !Number.isFinite(expires) || expires * 1000 < now || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = Buffer.from(createHmac('sha256', secret()).update(`${key}:${expires}`).digest('hex'));
  return timingSafeEqual(expected, Buffer.from(signature));
}
