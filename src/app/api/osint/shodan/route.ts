import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { shodanClient } from '@/lib/shodan/client';
import { getScanStatus, submitScan } from '@/lib/shodan/scans';
import { ShodanError } from '@/lib/shodan/types';
import { trustedRequestOrigin } from '@/lib/http/request-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
function response(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
function failure(error: unknown) {
  if (error instanceof ShodanError) return response({ error: error.message, code: error.code }, error.status);
  if (error instanceof OrganizationAccessError) return response({ error: error.message, code: 'access_denied' }, 403);
  return response({ error: 'Shodan operation could not be completed. Check authentication and the database configuration.', code: 'provider_down' }, 503);
}
function boolean(value: string | null): boolean {
  if (value !== null && value !== 'true' && value !== 'false') throw new ShodanError('invalid_request', 'Boolean options must be true or false.', 400);
  return value === 'true';
}
export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'cyber:read');
    if (isRateLimited(`shodan:${actor.userId}:${getClientIp(request)}`, 30, 60000)) throw new ShodanError('rate_limited', 'Too many Shodan requests. Wait a minute.', 429);
    const params = new URL(request.url).searchParams, client = shodanClient();
    const operation = params.get('operation') ?? (params.has('ip') ? 'host' : 'search');
    switch (operation) {
      case 'search': return response(await client.search(params.get('q') ?? '', params.get('facets') ?? '', Number(params.get('page') ?? 1), request.signal));
      case 'count': return response(await client.count(params.get('q') ?? '', params.get('facets') ?? '', request.signal));
      case 'host': return response(await client.host(params.get('ip') ?? '', boolean(params.get('history')), boolean(params.get('minify')), request.signal));
      case 'hosts': return response(await client.hosts(params.get('ips') ?? '', boolean(params.get('history')), boolean(params.get('minify'))));
      case 'resolve': return response(await client.resolve(params.get('hostnames') ?? ''));
      case 'reverse': return response(await client.reverse(params.get('ips') ?? ''));
      case 'api-info': {
        const info = await client.info(request.signal);
        return response({ ...info, warnings: { query: client.warnings(info, 'query'), scan: client.warnings(info, 'scan') } });
      }
      case 'scan-status': return response(await getScanStatus(actor, params.get('scan_id') ?? ''));
      default: throw new ShodanError('invalid_request', 'Unknown Shodan operation.', 400);
    }
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'organization:manage');
    if (!trustedRequestOrigin(request)) throw new ShodanError('access_denied', 'Scan submissions must come from this Ophanim deployment.', 403);
    if (isRateLimited(`shodan-scan:${actor.userId}`, 3, 60000)) throw new ShodanError('rate_limited', 'Too many scan submissions. Wait a minute.', 429);
    const input = await request.text();
    if (input.length > 8192) throw new ShodanError('invalid_request', 'Scan request is too large.', 400);
    let body: unknown;
    try { body = JSON.parse(input); } catch { throw new ShodanError('invalid_request', 'Expected a JSON scan request.', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ShodanError('invalid_request', 'Expected a JSON scan request.', 400);
    return response(await submitScan(actor, body as Record<string, unknown>));
  } catch (error) { return failure(error); }
}
