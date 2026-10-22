import data from './country-gazetteer.json';
import type { GazetteerEntry } from './analysis';
export const COUNTRY_REFERENCE = data.metadata;
export const COUNTRY_GAZETTEER: GazetteerEntry[] = data.entries.map(entry => ({ ...entry, type: 'country' }));
