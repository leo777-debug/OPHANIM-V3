import { mkdir, readFile, writeFile, unlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db/pool';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

// Private job-file bytes: the existing private Supabase bucket, a private
// filesystem directory (JOBFILE_STORAGE_DIR) outside public/ and the repo, or,
// with neither configured (serverless hosts), the private database table.
const inDatabase = () => !process.env.JOBFILE_STORAGE_DIR && !process.env.KNOWLEDGE_STORAGE_DIR && Boolean(process.env.DATABASE_URL);
async function localPath(key: string) {
  const directory = process.env.JOBFILE_STORAGE_DIR || process.env.KNOWLEDGE_STORAGE_DIR;
  if (!directory) throw new Error('Private storage is unavailable. Configure Supabase storage or JOBFILE_STORAGE_DIR.');
  const root = path.resolve(directory);
  const candidate = path.resolve(root, key);
  if (!candidate.startsWith(root + path.sep) || key.split(/[\\/]/).some((p) => !p || p === '..' || p === '.')) throw new Error('Invalid private storage key.');
  await mkdir(root, { recursive: true });
  const resolvedRoot = await realpath(/* turbopackIgnore: true */ root);
  await mkdir(path.dirname(candidate), { recursive: true });
  const resolvedParent = await realpath(/* turbopackIgnore: true */ path.dirname(candidate));
  if (!resolvedParent.startsWith(resolvedRoot + path.sep)) throw new Error('Storage symlink escapes the private root.');
  return candidate;
}
export async function storePrivateFile(key: string, bytes: Buffer, mime: string) {
  const admin = createSupabaseAdminClient();
  if (admin) { const { error } = await admin.storage.from('ophanim-private').upload(key, bytes, { contentType: mime, upsert: false }); if (error) throw new Error('Private file upload failed.'); }
  else if (inDatabase()) await db().query('insert into ophanim_private.private_files (storage_key, mime_type, byte_size, bytes) values ($1, $2, $3, $4)', [key, mime, bytes.length, bytes]);
  else await writeFile(await localPath(key), bytes, { flag: 'wx', mode: 0o600 });
}
export async function readPrivateFile(key: string): Promise<Buffer> {
  const admin = createSupabaseAdminClient();
  if (admin) { const { data, error } = await admin.storage.from('ophanim-private').download(key); if (error || !data) throw new Error('Private file not found.'); return Buffer.from(await data.arrayBuffer()); }
  if (inDatabase()) {
    const result = await db().query<{ bytes: Buffer }>('select bytes from ophanim_private.private_files where storage_key = $1', [key]);
    if (!result.rows[0]) throw new Error('Private file not found.');
    return result.rows[0].bytes;
  }
  return readFile(await localPath(key));
}
export async function deletePrivateFile(key: string) {
  const admin = createSupabaseAdminClient();
  if (admin) { const { error } = await admin.storage.from('ophanim-private').remove([key]); if (error) throw new Error('Private file deletion failed.'); }
  else if (inDatabase()) await db().query('delete from ophanim_private.private_files where storage_key = $1', [key]);
  else await unlink(await localPath(key)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
}
