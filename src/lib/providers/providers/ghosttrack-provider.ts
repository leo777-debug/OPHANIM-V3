import { spawn } from 'node:child_process';
import { resolve4 } from 'node:dns/promises';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { isIP } from 'node:net';
import type { NormalizedSearchResult, Provider, ProviderQuery } from '../types';

type GhostTrackMode = 'ip' | 'username';

interface ParsedGhostTrackIp {
  clean: string;
  ip?: string;
  country?: string;
  city?: string;
  region?: string;
  asn?: string;
  organization?: string;
  isp?: string;
  latitude: number;
  longitude: number;
}

interface ParsedGhostTrackUsername {
  clean: string;
  profiles: Array<{ service: string; url: string }>;
}

interface GhostTrackRaw {
  status: 'ok' | 'unavailable' | 'error';
  target: string;
  resolvedIp?: string;
  mode?: GhostTrackMode;
  output?: string;
  message?: string;
}

const ANSI = /\x1B\[[0-?]*[ -/]*[@-~]/g;

function config() {
  const directory = process.env.GHOSTTRACK_DIR || '/opt/ghosttrack';
  return {
    enabled: process.env.GHOSTTRACK_ENABLED !== 'false',
    directory,
    python: process.env.GHOSTTRACK_PYTHON || 'python3',
    script: path.join(directory, 'GhostTR.py'),
  };
}

function stripAnsi(value: string) {
  return value.replace(ANSI, '').replace(/\r/g, '');
}

function label(output: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = output.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+?)\\s*$`, 'im'));
  return match?.[1]?.trim();
}

export function parseGhostTrackOutput(output: string, mode: 'ip'): ParsedGhostTrackIp;
export function parseGhostTrackOutput(output: string, mode: 'username'): ParsedGhostTrackUsername;
export function parseGhostTrackOutput(output: string, mode: GhostTrackMode): ParsedGhostTrackIp | ParsedGhostTrackUsername {
  const clean = stripAnsi(output);
  if (mode === 'username') {
    const profiles = Array.from(clean.matchAll(/^\s*\[\s*\+\s*\]\s*([^:]+?)\s*:\s*(https?:\/\/\S+)\s*$/gim))
      .map((match) => ({ service: match[1].trim(), url: match[2].trim() }));
    return { profiles, clean };
  }

  return {
    clean,
    ip: label(clean, 'IP target'),
    country: label(clean, 'Country'),
    city: label(clean, 'City'),
    region: label(clean, 'Region'),
    asn: label(clean, 'ASN'),
    organization: label(clean, 'ORG'),
    isp: label(clean, 'ISP'),
    latitude: Number(label(clean, 'Latitude')),
    longitude: Number(label(clean, 'Longitude')),
  };
}

async function runGhostTrack(mode: GhostTrackMode, target: string, signal: AbortSignal): Promise<string> {
  const { directory, python, script } = config();
  await access(script);

  const input = mode === 'ip' ? `1\n${target}\n\n0\n` : `4\n${target}\n\n0\n`;
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], {
      cwd: directory,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const stop = () => {
      child.kill('SIGTERM');
      reject(new Error('GhostTrack execution timed out.'));
    };
    if (signal.aborted) return stop();
    signal.addEventListener('abort', stop, { once: true });
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      signal.removeEventListener('abort', stop);
      reject(error);
    });
    child.on('close', (code) => {
      signal.removeEventListener('abort', stop);
      if (code === 0) resolve(`${stdout}\n${stderr}`);
      else reject(new Error(stripAnsi(stderr || stdout || `GhostTrack exited with code ${code}`)));
    });
    child.stdin.end(input);
  });
}

async function executeGhostTrack(query: ProviderQuery, signal: AbortSignal): Promise<GhostTrackRaw> {
  const settings = config();
  if (!settings.enabled) {
    return { status: 'unavailable', target: query.query ?? '', message: 'GhostTrack is disabled on this server.' };
  }

  const target = query.query ?? '';
  try {
    if (query.intent === 'username_lookup') {
      return { status: 'ok', target, mode: 'username', output: await runGhostTrack('username', target, signal) };
    }

    let ip = target;
    if (query.intent === 'domain_lookup') {
      ip = (await resolve4(target))[0] || '';
      if (!ip) return { status: 'error', target, message: 'GhostTrack could not resolve an IPv4 address for this domain.' };
    }
    if (query.intent !== 'ip_lookup' && query.intent !== 'domain_lookup') {
      return { status: 'error', target, message: 'GhostTrack does not support this query type.' };
    }
    if (isIP(ip) !== 4) return { status: 'error', target, message: 'GhostTrack requires a valid IPv4 address.' };
    return { status: 'ok', target, resolvedIp: ip, mode: 'ip', output: await runGhostTrack('ip', ip, signal) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GhostTrack could not run.';
    const unavailable = /ENOENT|no such file|not found/i.test(message);
    return {
      status: unavailable ? 'unavailable' : 'error',
      target,
      message: unavailable ? 'GhostTrack is not installed on this server. Deploy the Docker image with GhostTrack enabled.' : message,
    };
  }
}

export const ghostTrackProvider: Provider = {
  metadata: {
    id: 'ghosttrack', name: 'ghosttrack', category: 'network',
    description: 'Backend-only GhostTrack enrichment for IP, domain, and username lookups.',
    supportedEntityTypes: ['ip', 'domain', 'username'],
    supportedIntents: ['ip_lookup', 'domain_lookup', 'username_lookup'],
    supportsMapLayers: false,
    requiresCredentials: false,
    timeoutMs: 30000,
    enabled: process.env.GHOSTTRACK_ENABLED !== 'false',
    priority: 30,
  },
  async createMapLayers() { return []; },
  async execute(query, context) { return executeGhostTrack(query, context.signal); },
  normalize(raw, query): NormalizedSearchResult[] {
    const result = raw as GhostTrackRaw;
    if (result.status !== 'ok' || !result.mode || !result.output) {
      return [{
        id: `ghosttrack:${result.status}:${result.target}`,
        label: result.status === 'unavailable' ? 'GhostTrack unavailable' : 'GhostTrack lookup failed',
        type: query.entityType, category: 'enrichment', importance: 0, zoomLevel: 0, provider: 'ghosttrack',
        summary: result.message || 'GhostTrack returned no data.',
      }];
    }

    if (result.mode === 'username') {
      const parsed = parseGhostTrackOutput(result.output, 'username');
      return [{
        id: `ghosttrack:username:${result.target}`,
        label: `@${result.target}`,
        type: 'username', category: 'identity', importance: 0.8, zoomLevel: 0, provider: 'ghosttrack',
        summary: parsed.profiles.length
          ? `Profiles found: ${parsed.profiles.map((profile) => profile.service).join(', ')}`
          : 'GhostTrack did not find a public profile match.',
      }];
    }

    const parsed = parseGhostTrackOutput(result.output, 'ip');
    const summary = [
      result.resolvedIp ? `IP ${result.resolvedIp}` : parsed.ip,
      parsed.city, parsed.region, parsed.country, parsed.organization || parsed.isp,
      parsed.asn ? `ASN ${parsed.asn}` : undefined,
    ].filter(Boolean).join(' | ') || 'GhostTrack IP intelligence record';
    const coordinates = Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude)
      ? { lat: parsed.latitude, lng: parsed.longitude }
      : {};
    return [{
      id: `ghosttrack:ip:${result.resolvedIp ?? result.target}`,
      label: result.target,
      type: query.entityType, category: 'network', importance: 0.8, zoomLevel: 8, provider: 'ghosttrack', summary,
      ...coordinates,
    }];
  },
};
