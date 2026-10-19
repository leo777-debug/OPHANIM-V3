import { INTEGRATIONS, type IntegrationDefinition } from './catalog';

export type IntegrationState = 'Configured' | 'Not configured' | 'Error' | 'Disabled by licence';
export interface ConnectionObservation {
  checkedAt: string;
  lastSuccessAt: string | null;
  error: string | null;
  latencyMs: number;
  scope: 'connection' | 'configuration';
  message: string;
}
export interface IntegrationStatus extends IntegrationDefinition {
  status: IntegrationState;
  missing: string[];
  observation: ConnectionObservation | null;
  guidance: string;
}

/** Explicit projection: never return values, suffixes, lengths or upstream bodies. */
export function integrationStatus(service: IntegrationDefinition, env: Record<string, string | undefined>, observation: ConnectionObservation | null = null): IntegrationStatus {
  const present = (name: string) => Boolean(env[name]?.trim());
  let missing = service.variables.filter(name => !present(name));
  if (service.id === 'supabase') missing = ['URL', 'PUBLISHABLE_KEY'].flatMap(suffix => present(`SUPABASE_${suffix}`) || present(`NEXT_PUBLIC_SUPABASE_${suffix}`) ? [] : [`SUPABASE_${suffix}`]);
  if (service.id === 'gemini' && Array.from({ length: 8 }, (_, i) => `GEMINI_API_KEY_${i + 1}`).some(present)) missing = [];
  if (service.id === 'ai' && present('AI_BASE_URL') && isLocalCompatible(env.AI_BASE_URL!, env.AI_LOCAL_BASE_URLS)) missing = missing.filter(name => name !== 'AI_API_KEY');
  if (service.id === 'voidaccess' && !present('VOIDACCESS_API_TOKEN') && !(present('VOIDACCESS_API_EMAIL') && present('VOIDACCESS_API_PASSWORD'))) missing.push('VOIDACCESS_API_TOKEN (or service email and password)');
  const disabled = (service.id === 'metar' && env.VERIFY_METAR_COMMERCIAL_USE !== 'yes')
    || (service.id === 'verify-observations' && !(env.VERIFY_OBSERVATIONS_COMMERCIAL_USE === 'yes' && present('VERIFY_OBSERVATIONS_LICENSE') && present('VERIFY_OBSERVATIONS_ATTRIBUTION') && present('VERIFY_OBSERVATIONS_TERMS_URL')));
  const status: IntegrationState = disabled ? 'Disabled by licence' : missing.length ? 'Not configured' : observation?.error ? 'Error' : 'Configured';
  return { ...service, status, missing, observation,
    guidance: disabled ? 'Complete the source commercial-use review before enabling.'
      : missing.length ? `Add your ${service.name} configuration in Admin → Integrations using the server environment.`
      : observation?.message ?? 'Configuration present. Connection not tested.' };
}

function isLocalCompatible(value: string, allowlist?: string) {
  try { const url = new URL(value); return (allowlist ?? '').split(',').some(allowed => {
    try { return new URL(allowed.trim()).origin === url.origin; } catch { return false; }
  }); } catch { return false; }
}

// Deliberately process-local until the persistent health scheduler is implemented.
// A restart clears observations; no timestamp is synthesized on list requests.
const observations = new Map<string, ConnectionObservation>();
export function integrationStatuses(env: Record<string, string | undefined> = process.env) {
  return INTEGRATIONS.map(service => integrationStatus(service, env, observations.get(service.id) ?? null));
}

export async function testIntegration(id: string, options: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; now?: () => number } = {}) {
  const service = INTEGRATIONS.find(item => item.id === id);
  if (!service) return null;
  const env = options.env ?? process.env;
  const status = integrationStatus(service, env);
  if (status.status === 'Not configured' || status.status === 'Disabled by licence') return status;
  const now = options.now ?? Date.now;
  const started = now();
  let error: string | null = null;
  if (service.probe) {
    // Only compile-time URLs, no user URL, key, Authorization or redirect forwarding.
    try {
      const response = await (options.fetcher ?? fetch)(service.probe, { signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json', 'User-Agent': 'Ophanim/1.0 (integration health)' } });
      await response.body?.cancel();
      if (!response.ok) error = `Provider returned HTTP ${response.status}.`;
    } catch { error = 'Connection unavailable or timed out. No credential or upstream error body was logged.'; }
  }
  const checkedAt = new Date(now()).toISOString();
  const observation: ConnectionObservation = {
    checkedAt, lastSuccessAt: service.probe && !error ? checkedAt : observations.get(id)?.lastSuccessAt ?? null,
    error, latencyMs: Math.max(0, now() - started), scope: service.probe ? 'connection' : 'configuration',
    message: service.probe ? error ?? 'Public endpoint reachable. Payload/data freshness is not validated by this test.'
      : 'Configuration checked only. This service does not yet have a safe connection-test adapter; no network request was made.',
  };
  observations.set(id, observation);
  return integrationStatus(service, env, observation);
}
