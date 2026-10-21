import data from './port-gazetteer.json';
import { GAZETTEER, normalizeTitle, type GazetteerEntry } from './analysis';
export const PORT_REFERENCE = data.metadata;
const key = (value: string) => normalizeTitle(value).replace(/^port of /, '').replace(/ port$/, '');
let cachedDictionary: readonly GazetteerEntry[] | null = null;
/** Immutable shared reference. Keep curated identities when a derived entry names the same existing port. */
export function mergedPortGazetteer(): readonly GazetteerEntry[] {
  if (cachedDictionary) return cachedDictionary;
  const dictionary = GAZETTEER.map(entry => ({ ...entry, aliases: [...entry.aliases] }));
  const curated = new Map(dictionary.filter(entry => entry.type === 'port').flatMap(entry => [entry.label, ...entry.aliases].map(alias => [key(alias), entry] as const)));
  for (const entry of data.entries) {
    const existing = curated.get(key(entry.label));
    if (existing) existing.aliases = [...new Set([...existing.aliases, ...entry.aliases])];
    else dictionary.push({ ...entry, type: 'port' });
  }
  for (const entry of dictionary) { Object.freeze(entry.aliases); Object.freeze(entry); }
  cachedDictionary = Object.freeze(dictionary);
  return cachedDictionary;
}
