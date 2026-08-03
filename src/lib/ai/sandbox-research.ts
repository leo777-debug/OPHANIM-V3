export const SANDBOX_RESEARCH_PURPOSES = ['confirm', 'assess_risk'] as const;

export type SandboxResearchPurpose = (typeof SANDBOX_RESEARCH_PURPOSES)[number];

export interface SandboxResearchRequest {
  subject: string;
  purpose: SandboxResearchPurpose;
  context?: string;
}

export interface SandboxResearchSource {
  title: string;
  url: string;
  publishedAt?: string;
  excerpt?: string;
}

export interface SandboxResearchResult {
  summary: string;
  riskIndicator: 'unknown' | 'low' | 'moderate' | 'high';
  uncertainty: string;
  sources: SandboxResearchSource[];
  collectedAt: string;
  limitations: string[];
}

const MAX_SUBJECT_LENGTH = 500;
const MAX_CONTEXT_LENGTH = 8_000;
const MAX_SOURCES = 12;
const MAX_TEXT_LENGTH = 8_000;

function text(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function endpoint(): URL | null {
  const value = process.env.AI_SANDBOX_RESEARCH_URL?.trim();
  if (!value) return null;
  const baseUrl = safeUrl(value);
  if (!baseUrl) throw new Error('AI_SANDBOX_RESEARCH_URL must be an HTTP(S) URL without credentials');
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/research`;
  url.search = '';
  return url;
}

export function sandboxResearchConfigured(): boolean {
  return Boolean(endpoint() && process.env.AI_SANDBOX_RESEARCH_TOKEN?.trim());
}

export function validateSandboxResearchRequest(value: unknown): SandboxResearchRequest {
  if (!value || typeof value !== 'object') throw new Error('Research request must be an object');
  const input = value as Partial<SandboxResearchRequest>;
  const subject = text(input.subject, MAX_SUBJECT_LENGTH);
  if (subject.length < 2) throw new Error('Research subject must be at least two characters');
  if (!SANDBOX_RESEARCH_PURPOSES.includes(input.purpose as SandboxResearchPurpose)) {
    throw new Error('Unsupported sandbox research purpose');
  }
  const context = text(input.context, MAX_CONTEXT_LENGTH);
  return { subject, purpose: input.purpose as SandboxResearchPurpose, ...(context ? { context } : {}) };
}

function normalizeResult(value: unknown): SandboxResearchResult {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const sources = Array.isArray(raw.sources) ? raw.sources.slice(0, MAX_SOURCES).flatMap((item) => {
    const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const url = safeUrl(source.url);
    const title = text(source.title, 300);
    return url && title ? [{
      title,
      url,
      ...(text(source.publishedAt, 80) ? { publishedAt: text(source.publishedAt, 80) } : {}),
      ...(text(source.excerpt, 1_200) ? { excerpt: text(source.excerpt, 1_200) } : {}),
    }] : [];
  }) : [];
  const riskIndicator = ['low', 'moderate', 'high'].includes(String(raw.riskIndicator))
    ? raw.riskIndicator as SandboxResearchResult['riskIndicator']
    : 'unknown';
  const summary = text(raw.summary);
  if (!summary) throw new Error('Sandbox research returned no summary');
  return {
    summary,
    riskIndicator,
    uncertainty: text(raw.uncertainty, 1_200) || 'This is a source-backed assessment, not a prediction or operational decision.',
    sources,
    collectedAt: text(raw.collectedAt, 80) || new Date().toISOString(),
    limitations: Array.isArray(raw.limitations) ? raw.limitations.map((item) => text(item, 300)).filter(Boolean).slice(0, 12) : [],
  };
}

export async function researchInSandbox(request: SandboxResearchRequest): Promise<SandboxResearchResult> {
  const url = endpoint();
  const token = process.env.AI_SANDBOX_RESEARCH_TOKEN?.trim();
  if (!url || !token) throw new Error('Sandbox research is not configured');
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(45_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Ophanim-Research-Mode': 'source-attributed',
    },
    body: JSON.stringify({
      ...request,
      policy: {
        browserExecution: 'sandbox_only',
        allowOperationalActions: false,
        requireSourceAttribution: true,
        riskAssessmentOnly: request.purpose === 'assess_risk',
      },
    }),
  });
  if (!response.ok) throw new Error(`Sandbox research service returned ${response.status}`);
  return normalizeResult(await response.json());
}
