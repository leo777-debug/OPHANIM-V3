import type { RegisteredEntity } from './types';
import { generateDarkWebQueries } from './query-generator';

// The existing entity graph is the only watchlist. Require a complete generated query,
// rather than substring validation ("our-domain OR anyone-else" must fail).
export function scopedQuery(query:string,entities:RegisteredEntity[]) {
 const fold=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
 return entities.find(e=>generateDarkWebQueries(e,{maxQueriesPerEntity:30}).some(q=>fold(q.query)===fold(query)));
}
export const LOGISTICS_THREAT_CATEGORIES=['cargo_theft','smuggling','sanctions_evasion_brokering','fraudulent_bills_of_lading','logistics_fraud'] as const;
// Do not accept arbitrary marketplace content. Managed adapters must return metadata
// they have already classified as safe; attachments/raw dumps are never fetched.
export function safeMetadata(value:{originalText:string;translatedText?:string;title?:string;threatCategories:string[]}) {
 const text=[value.title,value.originalText,value.translatedText,...value.threatCategories].join(' ');
 return !/\b(?:csam|child\s+(?:sexual|abuse|porn)|underage\s+(?:sexual|porn))\b/i.test(text);
}
