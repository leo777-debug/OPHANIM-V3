/** Optional authenticated Wikidata structured-reference service.
 * No direct person/IP profiling or bulk sanctions loading. Matches are not
 * identity verification, current operational status or sanctions clearance.
 */
import express from 'express';
import { pathToFileURL } from 'node:url';
const app = express();
import {configured,authorized} from './policy.mjs';
import { ALLOWED_TYPES, RESOLVERS, loadSanctions, sanctionsIndex, sanitizeId, wdCache } from './resolvers.mjs';
let activeResolutions=0;
app.use((req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  if(!configured(process.env.INTEL_API_TOKEN))return res.status(503).json({error:'Entity service is not configured.'});
  if(!authorized(req.headers.authorization,process.env.INTEL_API_TOKEN))return res.status(401).json({error:'Authentication required.'});
  if(req.path==='/resolve'){
    if(activeResolutions>=4)return res.status(429).json({error:'Resolution limit reached.'});
    activeResolutions++;let released=false;const release=()=>{if(!released){released=true;activeResolutions--;}};res.once('finish',release);res.once('close',release);
  }
  next();
});
const rawPort=Number(process.env.INTEL_PORT || 4000);
const PORT=Number.isInteger(rawPort) && rawPort>=1 && rawPort<=65535 ? rawPort : 4000;


// ════════════════════════════════════════════════════
// §6 — RATE LIMITER
// ════════════════════════════════════════════════════

const rateMap = new Map();

function isRateLimited(ip, limit = 30, windowMs = 60000) {
  const now = Date.now();
  for (const [k, v] of rateMap) { if (now > v.resetAt) rateMap.delete(k); }
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) { rateMap.set(ip, { count: 1, resetAt: now + windowMs }); return false; }
  entry.count++;
  return entry.count > limit;
}

// ════════════════════════════════════════════════════
// §7 — EXPRESS ROUTES
// ════════════════════════════════════════════════════

app.get('/health', (_req, res) => {
  res.json({
    status: 'ready',
    sources: [{id:'wikidata',licence:'CC0 structured data',upstreamTested:false},{id:'opensanctions',status:'disabled-by-licence'}],
    sanctions_entries: sanctionsIndex.entries.length,
    sanctions_loaded_at: sanctionsIndex.fetchedAt ? new Date(sanctionsIndex.fetchedAt).toISOString() : null,
    wikidata_cache_size: wdCache.size,
    uptime_seconds: Math.floor(process.uptime()),
  });
});

app.get('/resolve', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Rate limit exceeded' });

  const type = typeof req.query.type === 'string' ? req.query.type.toLowerCase().trim() : '';
  const rawId = typeof req.query.id === 'string' ? req.query.id.trim() : '';

  if (!type || !ALLOWED_TYPES.has(type)) {
    return res.status(400).json({ error: `Invalid type. Allowed: ${[...ALLOWED_TYPES].join(', ')}` });
  }
  if (!rawId || rawId.length < 2 || rawId.length > 200) {
    return res.status(400).json({ error: 'Invalid id (2-200 chars)' });
  }

  const id = sanitizeId(rawId);
  if (id.length < 2) return res.status(400).json({ error: 'ID contains too many invalid characters' });

  try {
    const resolver = RESOLVERS[type];
    // Pass extra properties for aircraft resolution (registration, model, etc.)
    const props = {};
    if (typeof req.query.registration === 'string' && req.query.registration.length <= 100) props.registration = sanitizeId(req.query.registration);
    if (typeof req.query.model === 'string' && req.query.model.length <= 100) props.model = sanitizeId(req.query.model);
    if (typeof req.query.icao24 === 'string' && req.query.icao24.length <= 100) props.icao24 = sanitizeId(req.query.icao24);
    const result = await resolver(id, props);
    res.set('Cache-Control', 'private, no-store');
    res.json({
      nodes: result.nodes,
      links: result.links,
      entity: { type, id },
      source: 'Wikidata structured reference enrichment (CC0); no identity verification',
      sourcePublishedAt:null,
      limitations:['Reference relationships may be incomplete or outdated. A name match is not identity confirmation. Source publication dates are unknown. OpenSanctions bulk loading is disabled pending commercial rights. Direct person and IP enrichment are disabled.'],
      sanctions_index_size: sanctionsIndex.entries.length,
      wikidata_cache_hits: wdCache.size,
      timestamp: new Date().toISOString(),
    });
  } catch {
    console.error('[INTEL] Reference resolution unavailable.');
    res.status(500).json({ error: 'Resolution failed', nodes: [], links: [] });
  }
});

// ════════════════════════════════════════════════════
// §8 — STARTUP
// ════════════════════════════════════════════════════

async function boot() {
  if(!configured(process.env.INTEL_API_TOKEN)){console.error('[INTEL] Dedicated worker token is not configured.');process.exitCode=1;return;}
  console.log('[INTEL] OSIRIS Intelligence Layer starting...');
  await loadSanctions();
  // No background source timer; bulk sanctions loading is disabled.

  const server=app.listen(PORT, '0.0.0.0', () => {
    console.log(`[INTEL] Intelligence Layer ready on port ${PORT}`);
    console.log(`[INTEL] Sanctions: ${sanctionsIndex.entries.length} entities indexed`);
    console.log('[INTEL] Authenticated reference resolver ready.');
  });
  server.maxConnections=32;server.requestTimeout=15000;server.headersTimeout=10000;server.timeout=20000;
}

export {app,boot};
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)boot().catch(()=>{console.error('[INTEL] Startup failed.');process.exitCode=1;});
