import type { EntityMatch, NormalizedMention, RegisteredEntity } from './types';

function fold(value: string): string { return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9.:-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function exact(text: string, value: string): boolean { const candidate = fold(value); if (!candidate) return false; return candidate.includes('.') || candidate.includes(':') || /^\d+$/.test(candidate) ? fold(text).includes(candidate) : new RegExp(`(^|[^a-z0-9])${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}($|[^a-z0-9])`, 'i').test(text); }
function method(identifierType: string | undefined, entity: RegisteredEntity): EntityMatch['matchMethod'] | undefined {
  const kind = (identifierType ?? '').toLowerCase();
  if (kind === 'imo') return 'exact_imo'; if (kind === 'mmsi') return 'exact_mmsi'; if (kind === 'callsign') return 'exact_callsign'; if (kind === 'unlocode') return 'exact_unlocode'; if (kind === 'domain' || entity.entityType === 'domain') return 'exact_domain'; if (kind === 'ip' || entity.entityType === 'ip') return 'exact_ip'; if (kind === 'client_identifier') return 'exact_client_identifier'; if (kind === 'vendor_product') return 'exact_vendor_product';
  return undefined;
}
function score(matchMethod: EntityMatch['matchMethod']): number { return ({ exact_imo: 100, exact_mmsi: 100, exact_callsign: 95, exact_unlocode: 95, exact_domain: 100, exact_ip: 100, exact_client_identifier: 100, exact_vendor_product: 92, vessel_alias_owner: 65, port_terminal: 60, company_domain: 55, product_dependency: 55, name_context: 40, weak_name: 15 } as const)[matchMethod]; }

export function matchMentionEntities(mention: NormalizedMention, entities: RegisteredEntity[]): EntityMatch[] {
  const text = `${mention.title ?? ''} ${mention.originalText} ${mention.translatedText ?? ''}`;
  const matched: EntityMatch[] = [];
  for (const entity of entities) {
    const candidates = [{ value: entity.canonicalName, identifierType: undefined }, ...entity.aliases.map((alias) => ({ value: alias.identifierValue ?? alias.alias, identifierType: alias.identifierType }))];
    let best: EntityMatch | undefined;
    for (const candidate of candidates) {
      if (!exact(text, candidate.value)) continue;
      const matchedMethod = method(candidate.identifierType, entity);
      const tokens = fold(candidate.value).split(' ').filter(Boolean);
      const matchMethod = matchedMethod ?? (tokens.length >= 2 ? 'name_context' : 'weak_name');
      const next: EntityMatch = { entityId: entity.id, matchMethod, matchedText: candidate.value, identifier: candidate.identifierType ? candidate.value : undefined, confidenceContribution: score(matchMethod), ambiguous: false, requiresReview: matchMethod === 'weak_name' || matchMethod === 'name_context', evidence: { entityType: entity.entityType, identifierType: candidate.identifierType ?? null } };
      if (!best || next.confidenceContribution > best.confidenceContribution) best = next;
    }
    if (best) matched.push(best);
  }
  const strengths = new Map<number, number>(); for (const candidate of matched) strengths.set(candidate.confidenceContribution, (strengths.get(candidate.confidenceContribution) ?? 0) + 1);
  return matched.map((candidate) => strengths.get(candidate.confidenceContribution)! > 1 ? { ...candidate, ambiguous: true, requiresReview: true } : candidate).sort((a, b) => b.confidenceContribution - a.confidenceContribution);
}
