// Build a dated, reproducible country/territory label reference from Node's ICU.
// The manually scoped region-code list excludes historical, organization and test codes.
import { writeFile } from 'node:fs/promises';
const codes = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(/\s+/);
if (codes.length !== 249 || new Set(codes).size !== 249) throw new Error('Region-code scope must contain 249 unique entries.');
const en = new Intl.DisplayNames(['en'], { type: 'region' }), ar = new Intl.DisplayNames(['ar'], { type: 'region' });
const key = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const ambiguous = { GE: ['Georgia'], TD: ['Chad'], JO: ['Jordan'], ML: ['مالي'], OM: ['عمان'] };
const reviewedAliases = {
  AE: ['UAE', 'الإمارات'], US: ['USA', 'United States of America'], GB: ['UK'], CZ: ['Czech Republic'], MM: ['Burma'], SZ: ['Swaziland'],
  GE: ['country of Georgia', 'Republic of Georgia'], TD: ['Republic of Chad', 'country of Chad'], JO: ['Hashemite Kingdom of Jordan', 'country of Jordan'],
  ML: ['دولة مالي', 'جمهورية مالي'], OM: ['سلطنة عمان'], CD: ['Democratic Republic of the Congo', 'DR Congo'], TR: ['Republic of Turkey'],
};
const entries = codes.map(code => {
  const label = en.of(code), arabic = ar.of(code);
  if (!label || !arabic || label === code || arabic === code) throw new Error(`Missing ICU labels: ${code}`);
  const excluded = new Set((ambiguous[code] ?? []).map(key));
  const aliases = [...new Set([label, arabic, label.normalize('NFKD').replace(/\p{M}/gu, ''), ...(reviewedAliases[code] ?? [])])].filter(alias => !excluded.has(key(alias)));
  return { id: `country:${code}`, label, aliases };
});
const metadata = {
  id: 'icu-country-labels', name: 'English / Arabic country and territory labels',
  version: `CLDR ${process.versions.cldr}, ICU ${process.versions.icu}, Unicode ${process.versions.unicode}`,
  datasetDate: new Date().toISOString().slice(0, 10), dateMeaning: 'Local reference generation date, not upstream publication date',
  source: 'https://cldr.unicode.org/', licence: 'Unicode License v3', commercialUse: 'yes', keyNeeded: false,
  attribution: 'Unicode, Inc. / CLDR / ICU region display names, generated using Node Intl.DisplayNames; Ophanim code scope and conservative aliases. Unicode licence retained.',
  termsUrl: 'https://www.unicode.org/license.txt', rateLimits: 'Packaged reference; no runtime upstream requests', refresh: 'Review when updating ICU/CLDR; no automatic upstream refresh',
  coverage: '249 manually scoped country/territory codes. Labels and matches imply no sovereignty claim or event geolocation. Ambiguous bare names are withheld.',
};
await writeFile(new URL('../src/lib/intelligence/country-gazetteer.json', import.meta.url), JSON.stringify({ metadata, entries }, null, 2) + '\n');
console.log(JSON.stringify({ entries: entries.length, version: metadata.version, generatedAt: metadata.datasetDate }));
