import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { NormalizedSearchResult, Provider } from '../types';

interface MaigretAccount {
  url_user?: string;
  site?: { name?: string };
  ids_data?: Record<string, unknown>;
}

interface MaigretRaw {
  status: 'ok' | 'unavailable' | 'error';
  username: string;
  accounts?: MaigretAccount[];
  message?: string;
}

function config() {
  const maxSites = Number(process.env.MAIGRET_MAX_SITES ?? '100');
  return {
    command: process.env.MAIGRET_COMMAND || 'maigret',
    enabled: process.env.MAIGRET_ENABLED !== 'false',
    maxSites: Number.isFinite(maxSites) ? Math.min(Math.max(Math.floor(maxSites), 1), 500) : 100,
  };
}

async function runMaigret(username: string, signal: AbortSignal): Promise<MaigretAccount[]> {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'ophanim-maigret-'));
  const { command, maxSites } = config();
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, [
        username, '--json', 'simple', '--folderoutput', outputDirectory,
        '--top-sites', String(maxSites), '--timeout', '5', '--no-autoupdate',
        '--no-recursion', '--no-extracting', '--no-progressbar', '--no-color',
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      const stop = () => {
        child.kill('SIGTERM');
        reject(new Error('Maigret execution timed out.'));
      };
      if (signal.aborted) return stop();
      signal.addEventListener('abort', stop, { once: true });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', (error) => {
        signal.removeEventListener('abort', stop);
        reject(error);
      });
      child.on('close', (code) => {
        signal.removeEventListener('abort', stop);
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `Maigret exited with code ${code}.`));
      });
    });
    const report = (await readdir(outputDirectory)).find((file) => file.endsWith('.json'));
    if (!report) return [];
    const data = JSON.parse(await readFile(path.join(outputDirectory, report), 'utf8')) as Record<string, MaigretAccount>;
    return Object.values(data).filter((account) => Boolean(account.url_user));
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

export const maigretProvider: Provider = {
  metadata: {
    id: 'maigret', name: 'maigret', category: 'identity',
    description: 'Backend-only public username discovery using Maigret.',
    supportedEntityTypes: ['username'],
    supportedIntents: ['username_lookup'],
    supportsMapLayers: false,
    requiresCredentials: false,
    timeoutMs: 45000,
    enabled: process.env.MAIGRET_ENABLED !== 'false',
    priority: 20,
  },
  async createMapLayers() { return []; },
  async execute(query, context): Promise<MaigretRaw> {
    const username = query.query ?? '';
    if (!config().enabled) return { status: 'unavailable', username, message: 'Maigret is disabled on this server.' };
    try {
      return { status: 'ok', username, accounts: await runMaigret(username, context.signal) };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Maigret could not run.';
      const unavailable = /ENOENT|not found/i.test(message);
      return { status: unavailable ? 'unavailable' : 'error', username, message: unavailable ? 'Maigret is not installed on this server.' : message };
    }
  },
  normalize(raw): NormalizedSearchResult[] {
    const result = raw as MaigretRaw;
    if (result.status !== 'ok') {
      return [{
        id: `maigret:${result.status}:${result.username}`,
        label: result.status === 'unavailable' ? 'Maigret unavailable' : 'Maigret lookup failed',
        type: 'username', category: 'identity', importance: 0, zoomLevel: 0, provider: 'maigret',
        summary: result.message || 'Maigret returned no data.',
      }];
    }
    const accounts = result.accounts ?? [];
    return [{
      id: `maigret:username:${result.username}`,
      label: `@${result.username}`,
      type: 'username', category: 'identity', importance: 0.9, zoomLevel: 0, provider: 'maigret',
      summary: accounts.length ? `Public accounts found: ${accounts.length}` : 'No public account matches found in the configured scan scope.',
    }, ...accounts.slice(0, 12).map((account, index) => ({
      id: `maigret:account:${result.username}:${index}`,
      label: account.site?.name || 'Public profile',
      type: 'username', category: 'identity', importance: 0.7, zoomLevel: 0, provider: 'maigret',
      summary: account.url_user || 'Public profile discovered by Maigret.',
    }))];
  },
};
