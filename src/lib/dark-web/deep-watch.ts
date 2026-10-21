// Deep Watch on top of the existing dark-web core: tenant-scoped exposure scans,
// the route-corridor view for Route Lens and per-shipment forecast features.
import { db } from '@/lib/watchlists/db';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';
import { reconcileIntelligence } from '@/lib/intelligence/operations';
import { runDarkWebSearch } from './index';
import { findRegisteredEntities } from './entity-registry';
import { storeDarkWebMentions } from './mention-store';
import { DARK_WEB_ENTITY_TYPES, type RegisteredEntity } from './types';

/** The tenant's own identifiers: the only terms licensed adapters may query. */
export function tenantTerms(entities: RegisteredEntity[]) {
  return [...new Set(entities.flatMap(entity => [entity.canonicalName, ...entity.aliases.map(alias => alias.identifierValue ?? alias.alias)]).map(value => value.trim()).filter(value => value.length >= 3))];
}
export async function allowedTermsFor(actor: OrganizationActor) { return tenantTerms(await findRegisteredEntities(actor)); }

/** Scan every registered identifier (domains, IMOs, ports, carriers, clients). Results flow into the existing review queue and alerts. */
export async function scanTenantExposure(actor: OrganizationActor, signal: AbortSignal, limit = 60) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:write');
  const entities = await findRegisteredEntities(actor), allowedTerms = tenantTerms(entities);
  const priority = (entity: RegisteredEntity) => ['domain', 'vessel', 'port', 'terminal', 'carrier', 'client', 'company'].indexOf(entity.entityType as string);
  const queries = entities.filter(entity => priority(entity) >= 0).sort((a, b) => priority(a) - priority(b))
    .flatMap(entity => entity.aliases.filter(alias => alias.identifierValue).map(alias => alias.identifierValue!).concat(entity.canonicalName)).filter((value, index, all) => all.indexOf(value) === index).slice(0, limit);
  let stored = 0, dropped = 0; const errors: string[] = [];
  for (const query of queries) {
    const result = await runDarkWebSearch(query, [...DARK_WEB_ENTITY_TYPES], { signal, organizationId: actor.organizationId, allowedTerms });
    dropped += result.diagnostics.reduce((sum, item) => sum + (item.droppedProhibited ?? 0), 0);
    for (const diagnostic of result.diagnostics) {
      if (diagnostic.error) { errors.push(`${diagnostic.providerId}: ${diagnostic.error}`); continue; }
      stored += (await storeDarkWebMentions(actor, diagnostic.providerId, result.mentions.filter(item => item.providerId === diagnostic.providerId).map(item => item.mention))).length;
    }
  }
  return { queries: queries.length, stored, droppedProhibited: dropped, errors: [...new Set(errors)].slice(0, 20), reconciliation: await reconcileIntelligence(actor) };
}

type CorridorRow = { mention_id: string; title: string | null; source_name: string; source_category: string; source_reference: string | null; source_reliability: number; threat_categories: string[]; first_seen_at: Date; review_status: string | null;
  match_method: string; matched_text: string; confidence_contribution: number; entity_name: string; entity_type: string };
/**
 * Mentions matching a shipment's route entities (vessel, carrier, ports, client) plus the existing
 * signal assessments for that shipment. False positives stay visible with their status so analysts can clear them.
 */
export async function corridorIntelligence(actor: OrganizationActor, shipmentId: string, terms: string[]) {
  requireOrganizationAccess(actor, actor.organizationId, 'intelligence:read');
  const keys = [...new Set(terms.map(term => term.trim().toLowerCase()).filter(term => term.length >= 3))];
  const rows = keys.length ? (await db().query<CorridorRow>(
    `select m.id as mention_id, m.title, m.source_name, m.source_category, m.source_reference, m.source_reliability, m.threat_categories, m.first_seen_at, r.review_status,
            mm.match_method, mm.matched_text, mm.confidence_contribution, e.canonical_name as entity_name, e.entity_type
       from ophanim_entities e join ophanim_entity_aliases a on a.entity_id = e.id
       join ophanim_mention_entity_matches mm on mm.entity_id = e.id join ophanim_dark_web_mentions m on m.id = mm.mention_id and m.organization_id = e.organization_id
       left join ophanim_intelligence_reviews r on r.mention_id = m.id and r.organization_id = e.organization_id
      where e.organization_id = $1 and (lower(e.canonical_name) = any($2) or a.normalized_alias = any($2) or lower(coalesce(a.identifier_value, '')) = any($2))
      order by mm.confidence_contribution desc, m.first_seen_at desc limit 200`, [actor.organizationId, keys])).rows : [];
  const assessments = (await db().query<{ mention_id: string; subject_label: string; assessment_status: string; confidence_score: number; confidence_level: string; correlation_signals: unknown }>(
    `select mention_id, subject_label, assessment_status, confidence_score, confidence_level, correlation_signals from ophanim_signal_assessments
      where organization_id = $1 and subject_type = 'shipment' and subject_id = $2 order by confidence_score desc limit 100`, [actor.organizationId, shipmentId])).rows;
  const byMention = new Map<string, CorridorRow & { matches: Array<{ method: string; text: string; entity: string }> }>();
  for (const row of rows) { const item = byMention.get(row.mention_id) ?? { ...row, matches: [] }; item.matches.push({ method: row.match_method, text: row.matched_text, entity: `${row.entity_type}: ${row.entity_name}` }); byMention.set(row.mention_id, item); }
  return {
    mentions: [...byMention.values()].map(item => ({ id: item.mention_id, title: item.title, sourceName: item.source_name, sourceCategory: item.source_category, sourceReference: item.source_reference, reliability: item.source_reliability, threatCategories: item.threat_categories,
      firstSeenAt: item.first_seen_at.toISOString(), reviewStatus: item.review_status ?? 'new', why: item.matches.map(match => `${match.method.replace(/_/g, ' ')} on ${match.entity} ("${match.text}")`), label: 'UNVERIFIED claim from a monitored source' })),
    assessments,
  };
}

const STRENGTH = ['exact_imo', 'exact_mmsi', 'exact_callsign', 'exact_unlocode', 'exact_domain', 'exact_ip', 'exact_client_identifier', 'exact_vendor_product', 'vessel_alias_owner', 'port_terminal', 'company_domain', 'product_dependency', 'name_context', 'weak_name'];
/** Forecast features for The Panel: mention count, strongest match method, best assessment confidence. */
export function darkWebFeatures(corridor: Awaited<ReturnType<typeof corridorIntelligence>>) {
  const live = corridor.mentions.filter(item => !['false_positive', 'duplicate', 'closed'].includes(item.reviewStatus));
  const methods = live.flatMap(item => item.why.map(why => why.split(' on ')[0].replace(/ /g, '_')));
  const strongest = methods.sort((a, b) => STRENGTH.indexOf(a) - STRENGTH.indexOf(b))[0] ?? null;
  return { dw_mention_count: live.length, dw_strongest_match: strongest, dw_strongest_match_rank: strongest ? STRENGTH.length - STRENGTH.indexOf(strongest) : 0, dw_max_assessment_confidence: Math.max(0, ...corridor.assessments.map(item => item.confidence_score)) / 100,
    dw_logistics_threats: [...new Set(live.flatMap(item => item.threatCategories))].filter(category => ['cargo_theft', 'smuggling', 'sanctions_evasion_brokering', 'fraudulent_bill_of_lading', 'logistics_fraud'].includes(category)).length };
}
