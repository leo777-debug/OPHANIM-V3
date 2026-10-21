// Deterministic reference-number validation. A failed check digit is either a
// wrong number or a reading error, so both are flagged, never silently fixed.

export const REFERENCE_TYPES = ['awb', 'hawb', 'bl', 'hbl', 'container', 'booking', 'invoice', 'customs_dec', 'delivery_order', 'client_ref', 'other'] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];
export type ReferenceValidation = { valid: boolean; normalized: string; code?: 'check_digit' | 'format' | 'unknown_prefix'; detail?: string };

const letterValue = (letter: string) => { let value = 10; for (let code = 65; code < letter.charCodeAt(0); code++) { value++; if (value % 11 === 0) value++; } return value; };

/** ISO 6346: owner code (3 letters), category (U/J/Z), 6-digit serial, check digit. */
export function containerCheckDigit(first10: string): number {
  const chars = first10.toUpperCase();
  const sum = [...chars].reduce((total, char, index) => total + (/[A-Z]/.test(char) ? letterValue(char) : Number(char)) * 2 ** index, 0);
  return (sum % 11) % 10;
}
export function validateContainer(value: string): ReferenceValidation {
  const normalized = value.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(normalized)) return { valid: false, normalized, code: 'format', detail: 'Expected 4 letters (ending U, J or Z) and 7 digits, e.g. CSQU3054383.' };
  const expected = containerCheckDigit(normalized.slice(0, 10));
  return Number(normalized[10]) === expected ? { valid: true, normalized } : { valid: false, normalized, code: 'check_digit', detail: `Check digit should be ${expected}.` };
}

/** Airline prefixes Ophanim recognises out of the box. Organizations can extend the list. */
export const KNOWN_AIRLINE_PREFIXES: Record<string, string> = {
  '001': 'American Airlines', '006': 'Delta Air Lines', '016': 'United Airlines', '020': 'Lufthansa', '057': 'Air France', '065': 'Saudia', '071': 'Ethiopian Airlines',
  '072': 'Gulf Air', '074': 'KLM', '077': 'EgyptAir', '098': 'Air India', '125': 'British Airways', '131': 'Japan Airlines', '141': 'flydubai', '157': 'Qatar Airways',
  '160': 'Cathay Pacific', '176': 'Emirates', '180': 'Korean Air', '205': 'ANA', '214': 'PIA', '217': 'Thai Airways', '229': 'Kuwait Airways', '235': 'Turkish Airlines',
  '297': 'China Airlines', '607': 'Etihad Airways', '618': 'Singapore Airlines', '781': 'China Eastern', '784': 'China Southern', '910': 'Oman Air', '999': 'Air China',
};
/** IATA air waybill: 3-digit airline prefix + 8-digit serial; 8th serial digit = first 7 digits mod 7. */
export function validateAwb(value: string, extraPrefixes: Record<string, string> = {}): ReferenceValidation & { airline?: string } {
  const normalized = value.replace(/[\s-]/g, '');
  if (!/^\d{11}$/.test(normalized)) return { valid: false, normalized, code: 'format', detail: 'Expected 3-digit airline prefix and 8-digit serial, e.g. 176-12345675.' };
  const serial = normalized.slice(3), expected = Number(serial.slice(0, 7)) % 7;
  const pretty = `${normalized.slice(0, 3)}-${serial}`;
  if (Number(serial[7]) !== expected) return { valid: false, normalized: pretty, code: 'check_digit', detail: `Last digit should be ${expected} (first 7 serial digits mod 7).` };
  const airline = { ...KNOWN_AIRLINE_PREFIXES, ...extraPrefixes }[normalized.slice(0, 3)];
  return airline ? { valid: true, normalized: pretty, airline } : { valid: false, normalized: pretty, code: 'unknown_prefix', detail: `Airline prefix ${normalized.slice(0, 3)} is not in the known list. Add it in settings if it is correct.` };
}

export function validateReference(type: ReferenceType, value: string, extraPrefixes?: Record<string, string>): ReferenceValidation {
  if (type === 'container') return validateContainer(value);
  if (type === 'awb') return validateAwb(value, extraPrefixes);
  const normalized = value.trim().toUpperCase().replace(/\s+/g, ' ');
  return normalized.length >= 3 && normalized.length <= 64 ? { valid: true, normalized } : { valid: false, normalized, code: 'format', detail: 'Reference must contain 3–64 characters.' };
}

export type FoundReference = { type: ReferenceType; value: string; validation: ReferenceValidation; index: number };
const PATTERNS: Array<{ type: ReferenceType; pattern: RegExp }> = [
  { type: 'container', pattern: /\b([A-Z]{3}[UJZ])[\s-]?(\d{6})[\s-]?(\d)\b/g },
  { type: 'awb', pattern: /\b(?:MAWB|AWB|M\/AWB)?[\s:#.]*(\d{3})[\s-]?(\d{4})[\s-]?(\d{4})\b/gi },
  { type: 'hawb', pattern: /\bHAWB[\s:#.]*([A-Z0-9-]{5,20})\b/gi },
  { type: 'hbl', pattern: /\bHB\/?L[\s:#.]*(?:NO\.?)?[\s:#.]*([A-Z0-9-]{6,20})\b/gi },
  { type: 'bl', pattern: /\b(?:MB\/?L|B\/L|BL|BILL OF LADING)[\s:#.]*(?:NO\.?)?[\s:#.]*([A-Z]{4}\d{6,12})\b/gi },
  { type: 'booking', pattern: /\bBOOKING[\s:#.]*(?:NO\.?|REF\.?)?[\s:#.]*([A-Z0-9-]{6,20})\b/gi },
  { type: 'invoice', pattern: /\bINVOICE[\s:#.]*(?:NO\.?|NUMBER)?[\s:#.]*([A-Z0-9][A-Z0-9/-]{3,20})\b/gi },
  { type: 'delivery_order', pattern: /\bD\/?O[\s:#.]*(?:NO\.?)?[\s:#.]*([A-Z0-9-]{5,20})\b/g },
];
/** Find reference numbers in free text (emails, OCR output). Invalid ones are kept and flagged. */
export function findReferences(text: string): FoundReference[] {
  const upper = text.toUpperCase(), found = new Map<string, FoundReference>();
  for (const { type, pattern } of PATTERNS) {
    for (const match of upper.matchAll(pattern)) {
      const raw = type === 'container' ? match[1] + match[2] + match[3] : type === 'awb' ? match[1] + match[2] + match[3] : match[1];
      if (type === 'invoice' && /^(DATE|TOTAL|NO)$/.test(raw)) continue;
      const validation = validateReference(type, raw);
      const key = `${type}:${validation.normalized}`;
      if (!found.has(key)) found.set(key, { type, value: raw, validation, index: match.index ?? 0 });
    }
  }
  return [...found.values()].sort((a, b) => a.index - b.index);
}
