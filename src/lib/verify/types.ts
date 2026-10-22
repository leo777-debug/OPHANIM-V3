export const CLAIM_TYPES = ['earthquake', 'airport', 'storm', 'wildfire', 'maritime', 'sanctions', 'news', 'not_checkable'] as const;
export type ClaimType = typeof CLAIM_TYPES[number];
export type Verdict = 'CONFIRMED' | 'PARTLY TRUE' | 'NOT CONFIRMED YET' | 'DATA SAYS OTHERWISE' | 'NOT CHECKABLE';
export type TrustTier = 'official' | 'wire' | 'established_media' | 'aggregator' | 'social';
export interface ParsedClaim {
  text: string;
  type: ClaimType;
  place: { name: string; latitude: number | null; longitude: number | null; code?: string };
  start: string;
  end: string;
  entities: string[];
  expectedObservation: string;
  minimumMagnitude: number;
}
export interface VerifyEvidence {
  id: string;
  source: string;
  sourceUrl: string;
  independenceKey: string;
  trust: TrustTier;
  observedAt: string;
  fetchedAt: string;
  stance: 'supports' | 'contradicts' | 'neutral';
  aspect: string;
  statement: string;
}
export interface VerifyResult {
  id: string;
  claim: ParsedClaim;
  verdict: Verdict;
  summary: string;
  aiSummary?: { label: 'INFERENCE'; text: string };
  checkedAt: string;
  evidence: VerifyEvidence[];
  checked: string[];
  couldNotCheck: Array<{ source: string; reason: string }>;
  mode: 'live' | 'replay';
  replay?: { fixture: string; recordedAt: string; provenance: 'synthetic_test_fixture' };
  previousId?: string;
  inputUrl?: string;
}

export const VERIFY_CONFIG = {
  maxClaimLength: 3000, maxUrlLength: 2048, maxRequestBytes: 16000,
  maxArticleBytes: 1024 * 1024, maxArticleText: 20000, maxQuoteLength: 240,
  urlTimeoutMs: 8000, maxRedirects: 3, radiusKm: 150, minimumMagnitude: 4.5,
  trustedPublisherCount: 2, maxWindowHours: 168, ratePerIp: 10, ratePerUser: 20,
  lowVisibilityMiles: 1, maximumEvidence: 50,
} as const;
