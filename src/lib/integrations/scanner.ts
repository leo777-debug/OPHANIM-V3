import { canonicalTarget, approvedTargets, MODES } from '../../../ops/recon/targets.mjs';
import { requestIntegration } from './probes';

export function scannerConfiguration(env: Record<string, string | undefined> = process.env) {
  const organizationId = env.SCANNER_ORGANIZATION_ID?.trim();
  const token = env.SCANNER_KEY ?? '';
  const targets = approvedTargets(env.SCANNER_ALLOWED_TARGETS);
  if (!organizationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId) ||
    token.length < 32 || /[\s\x00-\x1f\x7f]/.test(token) || !targets.length) return null;
  try {
    const base = new URL(env.SCANNER_URL ?? '');
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') return null;
    return { organizationId, token, targets, base: base.origin };
  } catch { return null; }
}

export function scannerInput(input: unknown): { target: string; mode: string } | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some(key => !['target', 'type'].includes(key))) return null;
  const target = canonicalTarget(record.target), mode = record.type ?? 'quick';
  return target && typeof mode === 'string' && MODES.includes(mode) ? { target, mode } : null;
}

export async function inspectApprovedTarget(config: NonNullable<ReturnType<typeof scannerConfiguration>>, input: { target: string; mode: string }) {
  const raw = JSON.parse(await requestIntegration({ url: `${config.base}/scan/${input.mode}?target=${encodeURIComponent(input.target)}`,
    headers: { Authorization: `Bearer ${config.token}` }, expected: 'json' }, process.env, 8000));
  if (!raw || raw.target !== input.target || raw.mode !== input.mode || !Number.isInteger(raw.httpStatus) || raw.httpStatus < 100 || raw.httpStatus > 599 ||
    typeof raw.observedAt !== 'string' || !Number.isFinite(Date.parse(raw.observedAt)) || Date.parse(raw.observedAt) > Date.now() + 300000) throw new Error('Invalid inspection observation.');
  const allowedHeaders = ['strict-transport-security', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'server'];
  const headers = Object.fromEntries(allowedHeaders.flatMap(name => typeof raw.headers?.[name] === 'string' ? [[name, raw.headers[name].slice(0, 2000)]] : []));
  const field = (value: unknown) => typeof value === 'string' ? value.slice(0, 200) : null;
  return { target: input.target, mode: input.mode, httpStatus: raw.httpStatus, observedAt: raw.observedAt, headers,
    tls: { authorized: typeof raw.tls?.authorized === 'boolean' ? raw.tls.authorized : null, protocol: field(raw.tls?.protocol),
      validFrom: field(raw.tls?.validFrom), validTo: field(raw.tls?.validTo), fingerprint256: field(raw.tls?.fingerprint256) },
    risk: 'unknown', attribution: 'Direct HTTPS response from the operator-approved target; no content republication.',
    limitations: ['One HTTPS HEAD request on port 443. No port sweep, exploitation, vulnerability validation or subdomain enumeration.',
      'Missing headers do not establish a vulnerability. Redirects are not followed. Cookies and bodies are excluded.'] };
}
