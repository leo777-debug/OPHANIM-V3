import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { isRateLimited } from '@/lib/ssrf-guard';
import { requestIntegration } from '@/lib/integrations/probes';
import { RESOLVERS, sanitizeId } from '../../../../../intel/resolvers.mjs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
const allowedTypes = new Set(['aircraft', 'vessel', 'company', 'country']);
export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:read');
    if (actor.authProvider === 'presentation-demo') return NextResponse.json({ error: 'Reference enrichment requires sign-in.' }, { status: 403, headers });
    const token = process.env.INTEL_API_TOKEN ?? '', organization = process.env.INTEL_ORGANIZATION_ID ?? '';
    // A separately deployed worker is optional; without one the same CC0 Wikidata
    // resolvers run in process (intel/resolvers.mjs).
    const workerConfigured = token.length >= 32 && !/[\s\x00-\x1f\x7f]/.test(token) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organization) && Boolean(process.env.INTEL_URL);
    if (workerConfigured && actor.organizationId !== organization) return NextResponse.json({ error: 'Entity enrichment is unavailable for this organization.' }, { status: 403, headers });
    if (isRateLimited(`entity:${actor.organizationId}:${actor.userId}`, 20, 60000)) return NextResponse.json({ error: 'Reference lookup limit reached.' }, { status: 429, headers });
    const type = request.nextUrl.searchParams.get('type')?.trim().toLowerCase() ?? '', id = request.nextUrl.searchParams.get('id')?.trim() ?? '';
    if (!allowedTypes.has(type) || id.length < 2 || id.length > 200) return NextResponse.json({ error: 'Use a bounded aircraft, vessel, company or country reference. Direct person/IP enrichment is unavailable.' }, { status: 400, headers });
    const extra: Record<string, string> = {};
    for (const key of ['registration', 'model', 'icao24']) {
      const value = request.nextUrl.searchParams.get(key);
      if (value && value.length <= 100) extra[key] = value;
    }
    let raw: { nodes?: unknown; links?: unknown };
    if (workerConfigured) {
      const url = new URL(process.env.INTEL_URL!);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid worker origin.');
      url.pathname = '/resolve'; url.searchParams.set('type', type); url.searchParams.set('id', id);
      for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
      raw = JSON.parse(await requestIntegration({ url: url.href, expected: 'json', headers: { Authorization: `Bearer ${token}` } }, process.env, 15000));
    } else {
      const reference = sanitizeId(id);
      if (reference.length < 2) return NextResponse.json({ error: 'The reference contains too many unsupported characters.' }, { status: 400, headers });
      raw = await RESOLVERS[type as 'aircraft' | 'vessel' | 'company' | 'country'](reference, Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, sanitizeId(value)])));
    }
    if (!Array.isArray(raw.nodes) || !Array.isArray(raw.links) || raw.nodes.length > 300 || raw.links.length > 600) throw new Error('Invalid reference graph.');
    const nodes = raw.nodes.flatMap((node: Record<string, unknown>) => {
      if (!node || typeof node.id !== 'string' || node.id.length > 300 || typeof node.label !== 'string' || node.label.length > 300 ||
        typeof node.type !== 'string' || !['aircraft','vessel','company','country','person','event'].includes(node.type)) return [];
      const properties = node.properties && typeof node.properties === 'object' ? node.properties as Record<string,unknown> : {};
      if (node.type === 'person' && !['CEO','Head of State'].includes(String(properties.role))) return [];
      const selected = Object.fromEntries(['source','role','model','registration','icao_code','population','gdp','tld','calling_code'].flatMap<[string,string | number]>(key => {
        const value = properties[key]; return typeof value === 'string' ? [[key,value.slice(0,500)]] : typeof value === 'number' && Number.isFinite(value) ? [[key,value]] : [];
      }));
      return [{id:node.id,label:node.label,type:node.type,properties:selected}];
    });
    const ids = new Set([...nodes.map((node: {id:string}) => node.id),`${type}:${id}`]);
    const links = raw.links.flatMap((link: Record<string,unknown>) => typeof link?.source === 'string' && typeof link.target === 'string' &&
      ids.has(link.source) && ids.has(link.target) && typeof link.label === 'string' ? [{source:link.source,target:link.target,label:link.label.slice(0,100)}] : []);
    // Reference facts only. Unknown source dates are not replaced with fetch time.
    return NextResponse.json({ nodes, links, source: 'Wikidata structured reference enrichment (CC0)', sourcePublishedAt: null,
      enrichedAt: new Date().toISOString(), limitations: ['Reference matches are not identity verification or live operational observations. Source publication dates are unknown.',
        'OpenSanctions bulk loading and direct person/IP enrichment are disabled.'] }, { headers });
  } catch (error) {
    if (error instanceof OrganizationAccessError) return NextResponse.json({ error: error.message, nodes: [], links: [],
      ...(error.message === 'Authentication is required.' ? { signInHref: '/login?returnTo=%2Fatlas' } : {}) }, { status: error.message === 'Authentication is required.' ? 401 : 403, headers });
    return NextResponse.json({ error: 'Reference enrichment unavailable, blocked or timed out. Check Admin → Integrations.', nodes: [], links: [] }, { status: 503, headers });
  }
}
