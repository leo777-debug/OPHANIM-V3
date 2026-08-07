import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type CyberThreat = {
  id: string;
  cve: string;
  name: string;
  vendor?: string;
  product?: string;
  affectedVersions?: string[];
  fixedVersions?: string[];
  exploitationStatus: 'known_exploited' | 'unknown';
  kev: boolean;
  epss?: number;
  cvss?: number;
  patchAvailable?: boolean;
  workaroundAvailable?: boolean;
  officialAdvisory: string;
  published?: string;
  modified?: string;
  remediationDeadline?: string;
  confidence: 'primary';
  missingInformation: string[];
  source: 'CISA KEV';
};

type SourceStatus = { name: string; status: 'available' | 'unavailable'; purpose: string };

let cache: { payload: Record<string, unknown>; expiresAt: number } | null = null;
let inFlight: Promise<Record<string, unknown>> | null = null;
const CACHE_TTL = 30 * 60 * 1000;

async function fetchJson(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
    headers: { Accept: 'application/json', 'User-Agent': 'Ophanim/1.0 operational-intelligence' },
  });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json();
}

function numericCvss(metrics: any): number | undefined {
  const metric = metrics?.cvssMetricV31?.[0] ?? metrics?.cvssMetricV30?.[0] ?? metrics?.cvssMetricV2?.[0];
  const score = Number(metric?.cvssData?.baseScore);
  return Number.isFinite(score) ? score : undefined;
}

function osvFixedVersions(vulnerability: any): string[] {
  const versions = new Set<string>();
  for (const affected of vulnerability?.affected ?? []) {
    for (const range of affected?.ranges ?? []) {
      for (const event of range?.events ?? []) {
        if (typeof event.fixed === 'string') versions.add(event.fixed);
      }
    }
  }
  return [...versions].slice(0, 8);
}

async function enrichCve(cve: string) {
  const [nvd, epss, osv] = await Promise.allSettled([
    fetchJson(`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cve)}`),
    fetchJson(`https://api.first.org/data/v1/epss?cve=${encodeURIComponent(cve)}`),
    fetchJson(`https://api.osv.dev/v1/vulns/${encodeURIComponent(cve)}`),
  ]);

  const nvdCve = nvd.status === 'fulfilled' ? nvd.value?.vulnerabilities?.[0]?.cve : null;
  const epssValue = epss.status === 'fulfilled' ? Number(epss.value?.data?.[0]?.epss) : Number.NaN;
  const osvValue = osv.status === 'fulfilled' ? osv.value : null;

  return {
    cvss: nvdCve ? numericCvss(nvdCve.metrics) : undefined,
    published: nvdCve?.published,
    modified: nvdCve?.lastModified,
    epss: Number.isFinite(epssValue) ? epssValue : undefined,
    fixedVersions: osvValue ? osvFixedVersions(osvValue) : [],
    nvdAvailable: Boolean(nvdCve),
    epssAvailable: Number.isFinite(epssValue),
    osvAvailable: Boolean(osvValue),
  };
}

async function buildPayload(): Promise<Record<string, unknown>> {
  const sources: SourceStatus[] = [];
  let vulnerabilities: any[] = [];
  try {
    const data = await fetchJson('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
    vulnerabilities = data.vulnerabilities ?? [];
    sources.push({ name: 'CISA KEV', status: 'available', purpose: 'Known exploitation and remediation deadlines.' });
  } catch {
    sources.push({ name: 'CISA KEV', status: 'unavailable', purpose: 'Known exploitation and remediation deadlines.' });
  }

  const recent = vulnerabilities
    .filter((item) => {
      const added = new Date(item.dateAdded).getTime();
      return Number.isFinite(added) && Date.now() - added <= 30 * 24 * 60 * 60 * 1000;
    })
    .slice(0, 12);

  // A small bounded enrichment fan-out respects public API service limits.
  const enrichment = await Promise.all(recent.slice(0, 4).map((item) => enrichCve(item.cveID)));
  const byCve = new Map(enrichment.map((item, index) => [recent[index].cveID, item]));
  const anyNvd = enrichment.some((item) => item.nvdAvailable);
  const anyEpss = enrichment.some((item) => item.epssAvailable);
  const anyOsv = enrichment.some((item) => item.osvAvailable);
  sources.push({ name: 'NIST NVD', status: anyNvd ? 'available' : 'unavailable', purpose: 'CVE metadata and CVSS enrichment.' });
  sources.push({ name: 'FIRST EPSS', status: anyEpss ? 'available' : 'unavailable', purpose: 'Exploitation-probability enrichment.' });
  sources.push({ name: 'OSV.dev', status: anyOsv ? 'available' : 'unavailable', purpose: 'Package and fixed-version enrichment.' });

  const threats: CyberThreat[] = recent.map((item) => {
    const details = byCve.get(item.cveID);
    const missingInformation = [
      !details?.nvdAvailable && 'NVD metadata unavailable',
      !details?.epssAvailable && 'EPSS unavailable',
      !details?.osvAvailable && 'OSV package metadata unavailable',
      !item.knownRansomwareCampaignUse && 'Ransomware-campaign use not specified by CISA',
    ].filter(Boolean) as string[];
    return {
      id: item.cveID,
      cve: item.cveID,
      name: item.vulnerabilityName,
      vendor: item.vendorProject,
      product: item.product,
      exploitationStatus: 'known_exploited',
      kev: true,
      epss: details?.epss,
      cvss: details?.cvss,
      fixedVersions: details?.fixedVersions,
      patchAvailable: Boolean(item.requiredAction),
      workaroundAvailable: false,
      officialAdvisory: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext=${encodeURIComponent(item.cveID)}`,
      published: details?.published ?? item.dateAdded,
      modified: details?.modified,
      remediationDeadline: item.dueDate,
      confidence: 'primary',
      missingInformation,
      source: 'CISA KEV',
    };
  });

  return {
    threats,
    sources,
    stats: {
      kevTotal: vulnerabilities.length,
      activeCves: threats.length,
      threatLevel: threats.length >= 8 ? 'CRITICAL' : threats.length >= 4 ? 'HIGH' : 'ELEVATED',
    },
    timestamp: new Date().toISOString(),
  };
}

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) return NextResponse.json(cache.payload);
  if (!inFlight) inFlight = buildPayload().finally(() => { inFlight = null; });
  try {
    const payload = await inFlight;
    cache = { payload, expiresAt: Date.now() + CACHE_TTL };
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } });
  } catch {
    return NextResponse.json({ threats: [], sources: [], stats: {}, error: 'Cyber sources are temporarily unavailable' }, { status: 503 });
  }
}
