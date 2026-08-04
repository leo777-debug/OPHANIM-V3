import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { runDarkWebSearch } from '@/lib/dark-web';
import { storeDarkWebMentions } from '@/lib/dark-web/mention-store';
import { DARK_WEB_ENTITY_TYPES, type DarkWebEntityType } from '@/lib/dark-web/types';
import { reconcileIntelligence } from '@/lib/intelligence/operations';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:write'); const body = await request.json() as { query?: unknown; entityTypes?: unknown };
    const query = typeof body.query === 'string' ? body.query.trim() : ''; if (!query || query.length > 500) return NextResponse.json({ error: 'A query of up to 500 characters is required.' }, { status: 400 });
    const entityTypes = (Array.isArray(body.entityTypes) ? body.entityTypes : []).filter((type): type is DarkWebEntityType => typeof type === 'string' && DARK_WEB_ENTITY_TYPES.includes(type as DarkWebEntityType));
    const result = await runDarkWebSearch(query, entityTypes.length ? entityTypes : [...DARK_WEB_ENTITY_TYPES], { signal: request.signal, organizationId: actor.organizationId });
    const mentions = await Promise.all(result.diagnostics.filter((diagnostic) => !diagnostic.error).map(async (diagnostic) => storeDarkWebMentions(actor, diagnostic.providerId, result.mentions.filter((item) => item.providerId === diagnostic.providerId).map((item) => item.mention))));
    const reconciliation = await reconcileIntelligence(actor);
    return NextResponse.json({ mentions: mentions.flat(), diagnostics: result.diagnostics, reconciliation });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Dark-web scan failed.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); }
}
