import type { RegisteredEntity } from './types';

export interface DarkWebQueryConfig { maxQueriesPerEntity?: number; priority?: 'low' | 'normal' | 'high'; expiresAt?: string; }
export interface GeneratedDarkWebQuery { query: string; priority: 'low' | 'normal' | 'high'; expiresAt?: string; source: string; }
const logisticsTerms = ['AIS spoofing', 'identity laundering', 'shadow fleet', 'sanctions evasion', 'ship-to-ship transfer', 'forged vessel documents', 'terminal access', 'subsea cable'];
const cyberTerms = ['credentials', 'database', 'access for sale', 'VPN access', 'RDP access', 'initial access', 'ransomware', 'leak', 'API key'];
function value(entity: RegisteredEntity): Array<{ value: string; source: string }> { return [...entity.aliases.map((alias) => ({ value: alias.identifierValue ?? alias.alias, source: alias.identifierType ?? 'alias' })), { value: entity.canonicalName, source: 'canonical_name' }].filter((item) => item.value.trim().length > 1); }
export function generateDarkWebQueries(entity: RegisteredEntity, config: DarkWebQueryConfig = {}): GeneratedDarkWebQuery[] {
  const limit = Math.min(Math.max(config.maxQueriesPerEntity ?? 12, 1), 30); const terms = ['vessel', 'port', 'terminal', 'subsea_cable', 'landing_station', 'carrier'].includes(entity.entityType) ? logisticsTerms : cyberTerms;
  const queries: GeneratedDarkWebQuery[] = [];
  for (const item of value(entity)) { queries.push({ query: item.value, priority: config.priority ?? 'normal', expiresAt: config.expiresAt, source: item.source }); for (const term of terms) queries.push({ query: `${item.value} ${term}`, priority: config.priority ?? 'normal', expiresAt: config.expiresAt, source: item.source }); }
  const seen = new Set<string>(); return queries.filter((candidate) => { const key = candidate.query.toLowerCase().replace(/\s+/g, ' ').trim(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, limit);
}
