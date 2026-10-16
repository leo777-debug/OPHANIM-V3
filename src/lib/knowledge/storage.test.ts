import { mkdtemp, mkdir, rmdir, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => null }));
import { deletePrivateFile, readPrivateFile, storePrivateFile } from './storage';

describe('private file storage boundaries', () => {
  let root: string;
  let outside: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'ophanim-storage-test-'));
    outside = await mkdtemp(path.join(tmpdir(), 'ophanim-storage-outside-'));
    vi.stubEnv('KNOWLEDGE_STORAGE_DIR', root);
  });
  afterEach(async () => {
    await unlink(path.join(root, 'org', 'fixture.txt')).catch(() => {});
    await rmdir(path.join(root, 'org')).catch(() => {});
    await rmdir(path.join(root, 'escape')).catch(() => {});
    await rmdir(root);
    await rmdir(outside);
    vi.unstubAllEnvs();
  });
  it.each(['../secret', '..\\secret', 'org/../../secret', 'org/./secret', '/secret'])('rejects traversal key %s', async (key) => {
    await expect(readPrivateFile(key)).rejects.toThrow('Invalid private storage key');
    await expect(storePrivateFile(key, Buffer.from('SYNTHETIC'), 'text/plain')).rejects.toThrow('Invalid private storage key');
    await expect(deletePrivateFile(key)).rejects.toThrow('Invalid private storage key');
  });
  it('supports private writes/reads/deletion and refuses overwrites', async () => {
    await storePrivateFile('org/fixture.txt', Buffer.from('SYNTHETIC ONLY'), 'text/plain');
    expect((await readPrivateFile('org/fixture.txt')).toString()).toBe('SYNTHETIC ONLY');
    await expect(storePrivateFile('org/fixture.txt', Buffer.from('replacement'), 'text/plain')).rejects.toThrow();
    await deletePrivateFile('org/fixture.txt');
    await expect(readPrivateFile('org/fixture.txt')).rejects.toThrow();
  });
  it('blocks a parent junction escaping the private root', async () => {
    await mkdir(outside, { recursive: true });
    await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(readPrivateFile('escape/secret.txt')).rejects.toThrow('symlink escapes');
  });
});
