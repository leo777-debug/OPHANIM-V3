import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { can, OrganizationAccessError } from '@/lib/operations/authorization';
import { createForecast, listForecasts, resolveForecast, ForecastInputError } from '@/lib/intelligence/forecasts';
import { boundedJson } from '@/lib/http/body';
import { isRateLimited } from '@/lib/ssrf-guard';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
function errorResponse(error: unknown) {
  return NextResponse.json({ error: error instanceof OrganizationAccessError ? 'Sign in with permission to access your organization’s forecasts.' : error instanceof ForecastInputError ? error.message : 'Forecast storage unavailable. Configure the database and apply the forecast migration.' }, { status: error instanceof OrganizationAccessError ? 403 : error instanceof ForecastInputError ? 400 : 503, headers });
}
export async function GET(request: NextRequest) {
  try { const actor = await requireAuthenticatedActor(request, 'intelligence:read'); return NextResponse.json({ forecasts: await listForecasts(actor), writable: can(actor, 'intelligence:write'), label: 'Sourced probabilities, not facts', limit: 200, scoring: 'Binary Brier score = (probability − outcome)²; lower is better. Unresolved questions are not scored.' }, { headers }); } catch (error) { return errorResponse(error); }
}
async function mutate(request: NextRequest, resolve: boolean) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403, headers });
    const actor = await requireAuthenticatedActor(request, 'intelligence:write');
    if (isRateLimited(`forecasts:${actor.organizationId}`, 20)) return NextResponse.json({ error: 'Please retry later.' }, { status: 429, headers });
    let body: unknown; try { body = await boundedJson(request, 12000); } catch { throw new ForecastInputError('A JSON body of at most 12 KB is required.'); }
    return NextResponse.json({ forecast: resolve ? await resolveForecast(actor, body) : await createForecast(actor, body) }, { status: resolve ? 200 : 201, headers });
  } catch (error) { return errorResponse(error); }
}
export const POST = (request: NextRequest) => mutate(request, false);
export const PATCH = (request: NextRequest) => mutate(request, true);
