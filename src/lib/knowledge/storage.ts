import { mkdir, readFile, writeFile, unlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

// Reuse the existing private bucket. Self-hosted legacy authentication may use
// an explicitly configured private filesystem, outside public/ and the repo.
async function localPath(key: string) {
  if (!process.env.KNOWLEDGE_STORAGE_DIR) throw new Error('Private storage is unavailable. Configure Supabase storage or KNOWLEDGE_STORAGE_DIR.');
  const root = path.resolve(process.env.KNOWLEDGE_STORAGE_DIR);
  const candidate = path.resolve(root, key);
  if (!candidate.startsWith(root + path.sep) || key.split(/[\\/]/).some((p) => !p || p === '..' || p === '.')) throw new Error('Invalid private storage key.');
  await mkdir(root, { recursive: true });
  const resolvedRoot = await realpath(root);
  await mkdir(path.dirname(candidate), { recursive: true });
  const resolvedParent = await realpath(path.dirname(candidate));
  if (!resolvedParent.startsWith(resolvedRoot + path.sep)) throw new Error('Storage symlink escapes the private root.');
  return candidate;
}
export async function storePrivateFile(key: string, bytes: Buffer, mime: string) {
  const admin = createSupabaseAdminClient();
  if (admin) { const { error } = await admin.storage.from('ophanim-private').upload(key, bytes, { contentType: mime, upsert: false }); if (error) throw new Error('Private file upload failed.'); }
  else await writeFile(await localPath(key), bytes, { flag: 'wx', mode: 0o600 });
}
export async function readPrivateFile(key: string): Promise<Buffer> {
  const admin = createSupabaseAdminClient();
  if (admin) { const { data, error } = await admin.storage.from('ophanim-private').download(key); if (error || !data) throw new Error('Private file not found.'); return Buffer.from(await data.arrayBuffer()); }
  return readFile(await localPath(key));
}
export async function deletePrivateFile(key: string) {
  const admin = createSupabaseAdminClient();
  if (admin) { const { error } = await admin.storage.from('ophanim-private').remove([key]); if (error) throw new Error('Private file deletion failed.'); }
  else await unlink(await localPath(key)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
}
