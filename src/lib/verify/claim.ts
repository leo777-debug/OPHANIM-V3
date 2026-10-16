import { CLAIM_TYPES, VERIFY_CONFIG, type ParsedClaim } from './types';
import { VerifyInputError } from './errors';

export const VERIFY_PLACES = [
  { name: 'Dubai airport', code: 'OMDB', latitude: 25.2532, longitude: 55.3657, aliases: ['dubai', 'dxb', 'omdb'] },
  { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503, aliases: ['tokyo'] },
  { name: 'Kochi', latitude: 9.9312, longitude: 76.2673, aliases: ['kochi', 'cochin'] },
  { name: 'Red Sea', latitude: 20, longitude: 38, aliases: ['red sea'] },
  { name: 'Gujarat', latitude: 22.3, longitude: 70.8, aliases: ['gujarat'] },
] as const;

export function assertPublicClaim(text: string): void {
  if (/\b(my|our)\s+(neighbou?r|coworker|colleague|friend|spouse|employee)\b|\b(doxx|home address|private individual|cheating on|is a thief|is a criminal|stole|murdered|arrested|sexual|affair|person named)\b/i.test(text)
    || /\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+(?:was|is|has been)\s+(?:killed|attacked|missing|injured|abducted)\b/.test(text)) {
    throw new VerifyInputError('Ophanim checks public events, not people.');
  }
}

export function parseClaimText(text: string, now = new Date()): ParsedClaim {
  text = text.trim();
  if (!text || text.length > VERIFY_CONFIG.maxClaimLength) throw new VerifyInputError('Enter a claim of 1 to 3000 characters.');
  assertPublicClaim(text);
  const type = /\b(will|might|should|opinion|believe|predict|deserves|motives?|not|never|no|killed|deaths?|dead|injured|casualties|destroyed)\b/i.test(text) ? 'not_checkable'
    : /earthquake|\bquake\b/i.test(text) ? 'earthquake'
      : /airport|\bflights?\b/i.test(text) && /closed|closure|delay|disrupt|cancel|divert|fog/i.test(text) ? 'airport'
        : /cyclone|storm|flood|hurricane/i.test(text) ? 'storm'
          : /wildfire|\bfire\b/i.test(text) ? 'wildfire'
            : /sanction/i.test(text) ? 'sanctions'
              : (/\b(ship|vessel)\b/i.test(text) && /attack|seiz/i.test(text)) || (/\bport\b/i.test(text) && /closed|closure/i.test(text)) ? 'maritime'
                : /explosion|attack|disruption|reported|closed/i.test(text) ? 'news' : 'not_checkable';
  const place = VERIFY_PLACES.find((entry) => entry.aliases.some((alias) => text.toLowerCase().includes(alias)));
  const magnitude = text.match(/(?:magnitude\s*|\bM)([0-9](?:\.[0-9])?)/i);
  return {
    text, type, place: place ? { name: place.name, latitude: place.latitude, longitude: place.longitude,
      ...('code' in place ? { code: place.code } : {}) } : { name: '', latitude: null, longitude: null },
    start: new Date(now.getTime() - 24 * 3600000).toISOString(), end: now.toISOString(), entities: [],
    expectedObservation: type === 'airport' ? (/closed/i.test(text) ? 'airport_closed' : 'flight_disruption')
      : type === 'maritime' ? (/seized/i.test(text) ? 'ship_seized' : /attacked/i.test(text) ? 'ship_attacked' : 'port_closed')
        : type === 'storm' ? (/flood/i.test(text) ? 'flood' : /cyclone|hurricane/i.test(text) ? 'tropical_cyclone' : 'severe_storm')
          : type === 'news' ? (text.match(/explosion|attack|disruption|closed/i)?.[0]?.toLowerCase() ?? 'reported_event') : type,
    minimumMagnitude: magnitude ? Number(magnitude[1]) : VERIFY_CONFIG.minimumMagnitude,
  };
}

export function validateParsedClaim(value: unknown): ParsedClaim {
  if (!value || typeof value !== 'object') throw new VerifyInputError('Review the parsed claim before checking.');
  const input = value as Record<string, unknown>;
  const fallback = parseClaimText(typeof input.text === 'string' ? input.text : '');
  if (!CLAIM_TYPES.includes(input.type as ParsedClaim['type'])) throw new VerifyInputError('Unsupported claim type.');
  const place = input.place as ParsedClaim['place'] | undefined;
  if (!place || typeof place.name !== 'string' || place.name.length > 160) throw new VerifyInputError('Enter a place name.');
  const latitude = place.latitude, longitude = place.longitude;
  if ((latitude === null) !== (longitude === null) || (latitude !== null && (!Number.isFinite(latitude) || Math.abs(latitude) > 90))
    || (longitude !== null && (!Number.isFinite(longitude) || Math.abs(longitude) > 180))) throw new VerifyInputError('Enter valid coordinates or leave both empty.');
  if (place.code !== undefined && !/^[A-Z0-9]{3,8}$/.test(place.code)) throw new VerifyInputError('Place code must contain 3 to 8 uppercase letters or numbers.');
  const start = typeof input.start === 'string' ? Date.parse(input.start) : NaN;
  const end = typeof input.end === 'string' ? Date.parse(input.end) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > VERIFY_CONFIG.maxWindowHours * 3600000) throw new VerifyInputError('Choose a valid time window of up to seven days.');
  const minimumMagnitude = Number(input.minimumMagnitude);
  if (!Number.isFinite(minimumMagnitude) || minimumMagnitude < 0 || minimumMagnitude > 10) throw new VerifyInputError('Magnitude must be between 0 and 10.');
  const entities = Array.isArray(input.entities) ? input.entities.filter((entity): entity is string => typeof entity === 'string' && entity.length > 0 && entity.length <= 160).slice(0, 10) : [];
  const expectedObservation = typeof input.expectedObservation === 'string' ? input.expectedObservation.slice(0, 160) : fallback.expectedObservation;
  const type = fallback.type === 'not_checkable' ? 'not_checkable' : input.type as ParsedClaim['type'];
  const allowed: Record<ParsedClaim['type'], string[]> = { earthquake: ['earthquake'], airport: ['airport_closed', 'flight_disruption'], storm: ['flood', 'tropical_cyclone', 'severe_storm'], wildfire: ['wildfire'], maritime: ['ship_attacked', 'ship_seized', 'port_closed'], sanctions: ['sanctions'], news: ['explosion', 'attack', 'disruption', 'closed', 'reported_event'], not_checkable: ['not_checkable'] };
  if (!allowed[type].includes(expectedObservation)) throw new VerifyInputError('Choose an observation appropriate for this claim type.');
  return { ...fallback, type,
    place: { name: place.name, latitude, longitude, ...(place.code ? { code: place.code } : {}) },
    start: new Date(start).toISOString(), end: new Date(end).toISOString(), entities, expectedObservation, minimumMagnitude };
}
