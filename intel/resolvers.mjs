/** Wikidata structured-reference resolvers (CC0), shared by the standalone
 * entity worker (intel/server.js) and the Ophanim app, which uses them in
 * process when no worker is configured. Requests go through policy.mjs
 * (Wikidata hosts and public addresses only).
 * No direct person/IP profiling or bulk sanctions loading.
 */
import { publicJson } from './policy.mjs';

// ════════════════════════════════════════════════════
// §1 — CONFIGURATION
// ════════════════════════════════════════════════════

const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';
const WIKIDATA_UA = 'OSIRIS-Intel/1.0 (https://osirisai.live; ontology engine)';
const WIKIDATA_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const WIKIDATA_CACHE_MAX = 10_000;

const ALLOWED_DOMAINS = new Set(['query.wikidata.org', 'www.wikidata.org']);

// ════════════════════════════════════════════════════
// §2 — SANCTIONS INDEX (in-memory graph)
// ════════════════════════════════════════════════════

let sanctionsIndex = {
  entries: [],
  byNorm: new Map(),   // normalised name/alias → [entry]
  fetchedAt: 0,
};

function normName(s) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

async function loadSanctions() {
  // No request: commercial bulk-data rights are unresolved for this deployment.
}

function sanctionsSearch(query, limit = 5) {
  if (!query || query.length < 3) return [];
  const q = normName(query);
  const exact = sanctionsIndex.byNorm.get(q) || [];
  if (exact.length > 0) return exact.slice(0, limit);

  const results = [];
  const seen = new Set();
  for (const entry of sanctionsIndex.entries) {
    if (results.length >= limit) break;
    if (seen.has(entry.id)) continue;
    const n = normName(entry.name);
    if (n.includes(q) || entry.aliases.some(a => normName(a).includes(q))) {
      seen.add(entry.id);
      results.push(entry);
    }
  }
  return results;
}

// ════════════════════════════════════════════════════
// §3 — WIKIDATA LRU CACHE
// ════════════════════════════════════════════════════

const wdCache = new Map(); // key → { data, ts }

function wdCacheGet(key) {
  const entry = wdCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > WIKIDATA_CACHE_TTL) { wdCache.delete(key); return null; }
  // Move to end (LRU)
  wdCache.delete(key);
  wdCache.set(key, entry);
  return entry.data;
}

function wdCacheSet(key, data) {
  if (wdCache.size >= WIKIDATA_CACHE_MAX) {
    const oldest = wdCache.keys().next().value;
    wdCache.delete(oldest);
  }
  wdCache.set(key, { data, ts: Date.now() });
}

// ════════════════════════════════════════════════════
// §4 — WIKIDATA SPARQL (safe)
// ════════════════════════════════════════════════════

function sanitizeId(id) {
  return id.replace(/[^a-zA-Z0-9 \-._]/g, '').trim();
}

async function sparql(query) {
  const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const parsed = new URL(url);
  if (!ALLOWED_DOMAINS.has(parsed.hostname)) {
    throw new Error(`Blocked domain: ${parsed.hostname}`);
  }
  const res = await publicJson(url, {
    headers: { 'User-Agent': WIKIDATA_UA, Accept: 'application/sparql-results+json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.results?.bindings || [];
}

// Search Wikidata for an entity by name, returns QID or null
async function wdSearch(query) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&limit=1&format=json`;
  const parsed = new URL(url);
  if (!ALLOWED_DOMAINS.has(parsed.hostname)) return null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': WIKIDATA_UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const id=json.search?.[0]?.id;return typeof id==='string' && /^Q[1-9][0-9]{0,14}$/.test(id) ? id : null;
  } catch { return null; }
}

// ════════════════════════════════════════════════════
// §5 — RESOLVERS (the intelligence)
// ════════════════════════════════════════════════════

function addSanctionsToGraph(query, rootId, nodes, links) {
  const matches = sanctionsSearch(query);
  for (const m of matches) {
    const sid = `sanction:${m.id}`;
    nodes.push({
      id: sid, label: `⚠ ${m.name}`, type: 'sanction',
      properties: {
        schema: m.schema, countries: m.countries.join(', '),
        programs: m.programs.join(', '), sanctions: m.sanctions,
        aliases: m.aliases.slice(0, 5).join('; '),
        first_seen: m.first_seen, sanctioned: true,
      },
    });
    links.push({ source: rootId, target: sid, label: 'SANCTIONS MATCH' });
  }
}

function dedup(nodes, links) {
  const seen = new Set();
  const uNodes = [];
  for (const n of nodes) { if (!seen.has(n.id)) { seen.add(n.id); uNodes.push(n); } }
  const lSeen = new Set();
  const uLinks = [];
  for (const l of links) {
    const k = `${l.source}→${l.target}→${l.label}`;
    if (!lSeen.has(k)) { lSeen.add(k); uLinks.push(l); }
  }
  return { nodes: uNodes, links: uLinks };
}

async function resolveAircraft(id, properties = {}) {
  const rootId = `aircraft:${id}`;
  const nodes = [], links = [];
  const cacheKey = `aircraft:${id}:${properties.registration || ''}`;
  const cached = wdCacheGet(cacheKey);
  if (cached) return { ...cached };

  const callsign = id.toUpperCase().trim();
  const registration = (properties.registration || '').toUpperCase().trim();
  const model = properties.model || '';

  // Step 1: Decode ICAO airline prefix from callsign (e.g. TRK → Turkish Airlines)
  // The prefix is the alphabetic portion of the callsign
  const airlinePrefix = callsign.replace(/[0-9]+$/, '');
  let airlineName = null;

  if (airlinePrefix && airlinePrefix.length >= 2) {
    // Search Wikidata for the ICAO airline code
    try {
      const results = await sparql(`
        SELECT ?item ?itemLabel ?countryLabel ?ceoLabel ?parentLabel WHERE {
          ?item wdt:P230 "${airlinePrefix}" .
          OPTIONAL { ?item wdt:P17 ?country . }
          OPTIONAL { ?item wdt:P169 ?ceo . }
          OPTIONAL { ?item wdt:P749 ?parent . }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
        } LIMIT 5`);

      for (const r of results) {
        if (r.itemLabel?.value) {
          airlineName = r.itemLabel.value;
          const airId = `company:${airlineName}`;
          nodes.push({ id: airId, label: airlineName, type: 'company', properties: { icao_code: airlinePrefix, source: 'Wikidata' } });
          links.push({ source: rootId, target: airId, label: 'OPERATED BY' });

          if (r.countryLabel?.value) {
            const cid = `country:${r.countryLabel.value}`;
            nodes.push({ id: cid, label: r.countryLabel.value, type: 'country', properties: { source: 'Wikidata' } });
            links.push({ source: airId, target: cid, label: 'HEADQUARTERED' });
          }
          if (r.ceoLabel?.value) {
            const pid = `person:${r.ceoLabel.value}`;
            nodes.push({ id: pid, label: r.ceoLabel.value, type: 'person', properties: { role: 'CEO', source: 'Wikidata' } });
            links.push({ source: airId, target: pid, label: 'CEO' });
          }
          if (r.parentLabel?.value) {
            const pid = `company:${r.parentLabel.value}`;
            nodes.push({ id: pid, label: r.parentLabel.value, type: 'company', properties: { source: 'Wikidata' } });
            links.push({ source: airId, target: pid, label: 'PARENT ORG' });
          }
        }
      }
    } catch { throw new Error('Reference source unavailable.'); }
  }

  // Step 2: Decode registration prefix → country (e.g. TC → Turkey, N → USA, G → UK)
  const REG_PREFIXES = {
    'N':'United States','G':'United Kingdom','F':'France','D':'Germany','I':'Italy',
    'JA':'Japan','HL':'South Korea','B':'China','VT':'India','TC':'Turkey',
    'SU':'Russia','RA':'Russia','UR':'Ukraine','A6':'UAE','A7':'Qatar','9V':'Singapore',
    'VH':'Australia','C':'Canada','PP':'Brazil','PR':'Brazil','PT':'Brazil',
    'EC':'Spain','PH':'Philippines','HS':'Thailand','9M':'Malaysia','PK':'Pakistan',
    'EP':'Iran','YI':'Iraq','HZ':'Saudi Arabia','4X':'Israel','SX':'Greece',
    'OE':'Austria','HB':'Switzerland','SE':'Sweden','OH':'Finland','LN':'Norway',
    'OY':'Denmark','PH':'Netherlands','OO':'Belgium','CS':'Portugal','SP':'Poland',
    'OK':'Czech Republic','HA':'Hungary','YR':'Romania','LZ':'Bulgaria',
    'EI':'Ireland','EW':'Belarus','ES':'Estonia','YL':'Latvia','LY':'Lithuania',
  };

  if (registration) {
    let regCountry = null;
    // Try 2-char prefix first, then 1-char
    if (REG_PREFIXES[registration.substring(0, 2)]) regCountry = REG_PREFIXES[registration.substring(0, 2)];
    else if (REG_PREFIXES[registration.substring(0, 1)]) regCountry = REG_PREFIXES[registration.substring(0, 1)];

    if (regCountry) {
      const cid = `country:${regCountry}`;
      nodes.push({ id: cid, label: regCountry, type: 'country', properties: { source: 'Registration prefix' } });
      links.push({ source: rootId, target: cid, label: 'REGISTERED IN' });
    }
  }

  // Step 3: Add aircraft model info
  if (model) {
    const mid = `aircraft:model:${model}`;
    nodes.push({ id: mid, label: model, type: 'aircraft', properties: { type: 'model', source: 'ADS-B' } });
    links.push({ source: rootId, target: mid, label: 'AIRCRAFT TYPE' });
  }

  // Step 4: Cross-ref sanctions on airline name + callsign
  addSanctionsToGraph(callsign, rootId, nodes, links);
  if (airlineName) addSanctionsToGraph(airlineName, rootId, nodes, links);
  if (registration) addSanctionsToGraph(registration, rootId, nodes, links);

  const result = dedup(nodes, links);
  wdCacheSet(cacheKey, result);
  return result;
}

async function resolveVessel(id) {
  const rootId = `vessel:${id}`;
  const nodes = [], links = [];
  const cached = wdCacheGet(`vessel:${id}`);
  if (cached) return { ...cached };

  try {
    const results = await sparql(`
      SELECT ?item ?itemLabel ?ownerLabel ?countryLabel ?operatorLabel ?flagLabel WHERE {
        { ?item wdt:P458 "${id}" . }
        UNION { ?item rdfs:label "${id}"@en . ?item wdt:P31/wdt:P279* wd:Q11446 . }
        OPTIONAL { ?item wdt:P127 ?owner . }
        OPTIONAL { ?item wdt:P17 ?country . }
        OPTIONAL { ?item wdt:P137 ?operator . }
        OPTIONAL { ?item wdt:P8047 ?flag . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
      } LIMIT 10`);
    for (const r of results) {
      if (r.ownerLabel?.value) {
        const oid = `company:${r.ownerLabel.value}`;
        nodes.push({ id: oid, label: r.ownerLabel.value, type: 'company', properties: { source: 'Wikidata' } });
        links.push({ source: rootId, target: oid, label: 'OWNED BY' });
      }
      const flag = r.flagLabel?.value || r.countryLabel?.value;
      if (flag) {
        const cid = `country:${flag}`;
        nodes.push({ id: cid, label: flag, type: 'country', properties: { source: 'Wikidata' } });
        links.push({ source: rootId, target: cid, label: 'FLAG STATE' });
      }
      if (r.operatorLabel?.value) {
        const oid = `company:${r.operatorLabel.value}`;
        nodes.push({ id: oid, label: r.operatorLabel.value, type: 'company', properties: { source: 'Wikidata' } });
        links.push({ source: rootId, target: oid, label: 'OPERATED BY' });
      }
    }
  } catch { throw new Error('Reference source unavailable.'); }

  addSanctionsToGraph(id, rootId, nodes, links);
  const result = dedup(nodes, links);
  wdCacheSet(`vessel:${id}`, result);
  return result;
}

async function resolveCompany(id) {
  const rootId = `company:${id}`;
  const nodes = [], links = [];
  const cached = wdCacheGet(`company:${id}`);
  if (cached) return { ...cached };

  try {
    // Use Wikidata search to find the QID first, then resolve by QID
    const qid = await wdSearch(id);
    const filter = qid
      ? `VALUES ?item { wd:${qid} }`
      : `?item rdfs:label "${id}"@en . { ?item wdt:P31/wdt:P279* wd:Q4830453 . } UNION { ?item wdt:P31/wdt:P279* wd:Q43229 . }`;
    const results = await sparql(`
      SELECT ?item ?itemLabel ?countryLabel ?parentLabel ?ceoLabel ?industryLabel WHERE {
        ${filter}
        OPTIONAL { ?item wdt:P17 ?country . }
        OPTIONAL { ?item wdt:P749 ?parent . }
        OPTIONAL { ?item wdt:P169 ?ceo . }
        OPTIONAL { ?item wdt:P452 ?industry . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
      } LIMIT 10`);
    for (const r of results) {
      if (r.countryLabel?.value) {
        const cid = `country:${r.countryLabel.value}`;
        nodes.push({ id: cid, label: r.countryLabel.value, type: 'country', properties: { source: 'Wikidata' } });
        links.push({ source: rootId, target: cid, label: 'HEADQUARTERED' });
      }
      if (r.parentLabel?.value) {
        const pid = `company:${r.parentLabel.value}`;
        nodes.push({ id: pid, label: r.parentLabel.value, type: 'company', properties: { source: 'Wikidata' } });
        links.push({ source: rootId, target: pid, label: 'PARENT ORG' });
      }
      if (r.ceoLabel?.value) {
        const pid = `person:${r.ceoLabel.value}`;
        nodes.push({ id: pid, label: r.ceoLabel.value, type: 'person', properties: { role: 'CEO', source: 'Wikidata' } });
        links.push({ source: rootId, target: pid, label: 'CEO' });
      }
    }
  } catch { throw new Error('Reference source unavailable.'); }

  addSanctionsToGraph(id, rootId, nodes, links);
  const result = dedup(nodes, links);
  wdCacheSet(`company:${id}`, result);
  return result;
}

async function resolveCountry(id) {
  const rootId = `country:${id}`;
  const nodes = [], links = [];
  const cached = wdCacheGet(`country:${id}`);
  if (cached) return { ...cached };

  try {
    const qid = await wdSearch(id);
    const filter = qid
      ? `VALUES ?item { wd:${qid} }`
      : `?item rdfs:label "${id}"@en . ?item wdt:P31 wd:Q6256 .`;
    const results = await sparql(`
      SELECT ?item ?itemLabel ?headLabel ?capitalLabel ?population ?gdp
             ?tld ?callingCode ?memberOfLabel ?neighborLabel WHERE {
        ${filter}
        OPTIONAL { ?item wdt:P35 ?head . }
        OPTIONAL { ?item wdt:P36 ?capital . }
        OPTIONAL { ?item wdt:P1082 ?population . }
        OPTIONAL { ?item wdt:P2131 ?gdp . }
        OPTIONAL { ?item wdt:P78 ?tld . }
        OPTIONAL { ?item wdt:P474 ?callingCode . }
        OPTIONAL { ?item wdt:P463 ?memberOf . }
        OPTIONAL { ?item wdt:P47 ?neighbor . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
      } LIMIT 50`);

    const seenHeads = new Set();
    const seenMembers = new Set();
    const seenNeighbors = new Set();
    let propsSet = false;

    for (const r of results) {
      // Head of state/government
      if (r.headLabel?.value && !seenHeads.has(r.headLabel.value)) {
        seenHeads.add(r.headLabel.value);
        const hid = `person:${r.headLabel.value}`;
        nodes.push({ id: hid, label: r.headLabel.value, type: 'person', properties: { role: 'Head of State', source: 'Wikidata' } });
        links.push({ source: rootId, target: hid, label: 'HEAD OF STATE' });
      }

      // Capital city
      if (r.capitalLabel?.value && !propsSet) {
        const capId = `event:${r.capitalLabel.value}`;
        nodes.push({ id: capId, label: r.capitalLabel.value, type: 'event', properties: { role: 'Capital', source: 'Wikidata' } });
        links.push({ source: rootId, target: capId, label: 'CAPITAL' });
      }

      // Country properties (population, GDP, TLD, calling code)
      if (!propsSet) {
        const props = { source: 'Wikidata' };
        if (r.population?.value) props.population = r.population.value;
        if (r.gdp?.value) props.gdp = r.gdp.value;
        if (r.tld?.value) props.tld = r.tld.value;
        if (r.callingCode?.value) props.calling_code = r.callingCode.value;
        nodes.push({ id: rootId, label: id, type: 'country', properties: props });
        propsSet = true;
      }

      // Member of (UN, NATO, EU, etc.)
      if (r.memberOfLabel?.value && !seenMembers.has(r.memberOfLabel.value)) {
        seenMembers.add(r.memberOfLabel.value);
        const mid = `company:${r.memberOfLabel.value}`;
        nodes.push({ id: mid, label: r.memberOfLabel.value, type: 'company', properties: { role: 'Organization', source: 'Wikidata' } });
        links.push({ source: rootId, target: mid, label: 'MEMBER OF' });
      }

      // Neighboring countries
      if (r.neighborLabel?.value && !seenNeighbors.has(r.neighborLabel.value)) {
        seenNeighbors.add(r.neighborLabel.value);
        const nid = `country:${r.neighborLabel.value}`;
        nodes.push({ id: nid, label: r.neighborLabel.value, type: 'country', properties: { source: 'Wikidata' } });
        links.push({ source: rootId, target: nid, label: 'NEIGHBOR' });
      }
    }
  } catch { throw new Error('Reference source unavailable.'); }

  addSanctionsToGraph(id, rootId, nodes, links);
  const result = dedup(nodes, links);
  wdCacheSet(`country:${id}`, result);
  return result;
}

const RESOLVERS = { aircraft: resolveAircraft, vessel: resolveVessel, company: resolveCompany, country: resolveCountry };
const ALLOWED_TYPES = new Set(Object.keys(RESOLVERS));

export { ALLOWED_TYPES, RESOLVERS, loadSanctions, sanctionsIndex, sanitizeId, wdCache };
