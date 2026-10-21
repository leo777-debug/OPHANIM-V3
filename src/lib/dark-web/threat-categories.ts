// Logistics threat categories for Deep Watch, added alongside the existing ones
// (ais_manipulation, forged_documents, terminal_access…). Keyword rules tag
// mentions that a provider did not categorise; providers' own tags are kept.
export const LOGISTICS_THREAT_CATEGORIES = ['cargo_theft', 'smuggling', 'sanctions_evasion_brokering', 'fraudulent_bill_of_lading', 'logistics_fraud'] as const;
export type LogisticsThreatCategory = (typeof LOGISTICS_THREAT_CATEGORIES)[number];

const RULES: Array<[LogisticsThreatCategory, RegExp]> = [
  ['cargo_theft', /\b(cargo theft|stolen (cargo|containers?|shipments?)|pull (high[- ]value )?(boxes|cargo)|hijack(ed|ing)? trucks?|seal tamper)/i],
  ['smuggling', /\b(smuggl\w*|contraband|hidden in (mislabell?ed )?(containers?|boxes|reefers?))/i],
  ['sanctions_evasion_brokering', /\b(evade (the )?sanctions|sanctions[- ]evasion|ship[- ]to[- ]ship transfer|disguise (the )?cargo origin|dark (fleet|transfer)|flag hopping)/i],
  ['fraudulent_bill_of_lading', /\b((fake|forged|blank|fraudulent) (original )?(bills? of lading|b\/ls?)|release fraud)/i],
  ['logistics_fraud', /\b(fake (freight )?forwarders?|changed bank details|payment diversion|freight (invoice )?fraud|double[- ]brokering|phantom carrier)/i],
];
export function classifyThreats(text: string): LogisticsThreatCategory[] {
  return RULES.filter(([, pattern]) => pattern.test(text)).map(([category]) => category);
}
