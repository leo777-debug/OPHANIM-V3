import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { validateHost, isRateLimited } from '@/lib/ssrf-guard';
import { scanAllowlist, validateScanTargets } from '@/lib/shodan/scan-guard';
import { ShodanError } from '@/lib/shodan/types';
import { db } from '@/lib/watchlists/db';
import { trustedRequestOrigin } from '@/lib/http/request-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_SCANS: Record<string, { endpoint: string; timeout: number }> = {
  quick: { endpoint: '/scan/quick', timeout: 15000 },
  ssl: { endpoint: '/scan/ssl', timeout: 10000 },
  headers: { endpoint: '/scan/headers', timeout: 10000 },
  rdns: { endpoint: '/scan/rdns', timeout: 8000 },
  subdomains: { endpoint: '/scan/subdomains', timeout: 15000 },
  tech: { endpoint: '/scan/tech', timeout: 15000 },
  whois: { endpoint: '/scan/whois', timeout: 10000 },
  geoloc: { endpoint: '/scan/geoloc', timeout: 8000 },
  vuln: { endpoint: '/scan/vuln', timeout: 90000 },
};

function response(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
function failure(error: unknown) {
  if (error instanceof OrganizationAccessError) return response({ error: error.message }, error.message === 'Authentication is required.' ? 401 : 403);
  if (error instanceof ShodanError) return response({ error: error.message, code: error.code }, error.status);
  return response({ error: 'Scanner unavailable. Check the service and audit database configuration.' }, 503);
}
function redact(value: unknown, key: string): unknown {
  if (typeof value === 'string') return value.replaceAll(key, '[redacted]');
  if (Array.isArray(value)) return value.map((item) => redact(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name.replaceAll(key, '[redacted]'), redact(item, key)]));
  return value;
}

// GET must never contact a live target (including via link previews or crawlers).
export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedActor(request, 'cyber:read');
    return NextResponse.json({ error: 'Use a confirmed POST to submit an authorized scan.' }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    if (!trustedRequestOrigin(request)) return response({ error: 'Cross-origin scan submissions are not permitted.' }, 403);
    const actor = await requireAuthenticatedActor(request, 'organization:manage');
    if (isRateLimited(`scanner:user:${actor.userId}`, 3, 60000)) return response({ error: 'Scan limit reached. Wait a minute.' }, 429);
    const text = await request.text();
    if (text.length > 4096) return response({ error: 'Scan request is too large.' }, 400);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return response({ error: 'Expected a JSON scan request.' }, 400);
      body = parsed as Record<string, unknown>;
    } catch { return response({ error: 'Expected a JSON scan request.' }, 400); }
    if (body.confirm !== true) return response({ error: 'Confirm you own or have written authorization to scan this host.' }, 400);
    const target = typeof body.target === 'string' ? body.target.trim() : '';
    // The legacy backend cannot pin hostname resolution. Literal authorized IPs
    // avoid a second DNS resolution changing the target after approval.
    if (!isIP(target)) return response({ error: 'Use one approved literal IPv4 or IPv6 address, not a hostname, URL or CIDR.' }, 400);
    validateScanTargets(target, true, scanAllowlist(actor.organizationId), 1);
    const guard = await validateHost(target);
    if (!guard.ok) return response({ error: 'Private or reserved scan targets are blocked.' }, 403);
    const type = typeof body.type === 'string' ? body.type : 'quick';
    const config = Object.hasOwn(ALLOWED_SCANS, type) ? ALLOWED_SCANS[type] : undefined;
    if (!config) return response({ error: 'This scan type is not available.' }, 403);
    const key = process.env.SCANNER_KEY ?? '';
    const service = process.env.SCANNER_URL ?? '';
    if (!key || !service) return response({ error: 'Scanner not configured. Ask the administrator to configure the private scanner service.' }, 503);
    const endpoint = new URL(config.endpoint, service);
    if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) return response({ error: 'Invalid scanner service configuration.' }, 503);
    // Fail closed if an audit record cannot be stored, before touching a host.
    const audit = await db().query<{ id: string }>(
      `insert into ophanim_audit_events(organization_id,actor_user_id,action,subject_type,metadata) values($1,$2,'scanner.scan.started','scanner_scan',$3) returning id`,
      [actor.organizationId, actor.userId, JSON.stringify({ target, type, submittedAt: new Date().toISOString() })]);
    const auditId = audit.rows[0]?.id;
    if (!auditId) return response({ error: 'Scan audit could not be recorded.' }, 503);
    endpoint.search = new URLSearchParams({ key, target }).toString();
    try {
      const result = await fetch(endpoint, { signal: AbortSignal.timeout(config.timeout), redirect: 'error' });
      if (!result.ok) throw new Error('Scanner provider rejected the request');
      const data: unknown = await result.json();
      await db().query(`update ophanim_audit_events set action='scanner.scan.completed' where id=$1 and organization_id=$2`, [auditId, actor.organizationId]);
      return response(redact(data, key));
    } catch {
      await db().query(`update ophanim_audit_events set action='scanner.scan.unconfirmed' where id=$1 and organization_id=$2`, [auditId, actor.organizationId]).catch(() => {});
      return response({ error: 'Scanner request could not be confirmed. Do not automatically retry; ask an administrator to check the audit.' }, 502);
    }
  } catch (error) { return failure(error); }
}
