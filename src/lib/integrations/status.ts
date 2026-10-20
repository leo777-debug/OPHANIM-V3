import { INTEGRATIONS, type IntegrationDefinition } from './catalog';
import { readRuntimeScope, writeRuntimeValue, type RuntimeStorage } from '@/lib/runtime/store';
import { connectionProbe, runConnectionProbe } from './probes';

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
  storage?: RuntimeStorage;
  storageWarning?: string;
}

/** Explicit projection: never return values, suffixes, lengths or upstream bodies. */
export function integrationStatus(service: IntegrationDefinition, env: Record<string, string | undefined>, observation: ConnectionObservation | null = null): IntegrationStatus {
  const present = (name: string) => Boolean(env[name]?.trim());
  let missing = service.variables.filter(name => !present(name));
  if (service.id === 'supabase') missing = ['URL', 'PUBLISHABLE_KEY'].flatMap(suffix => present(`SUPABASE_${suffix}`) || present(`NEXT_PUBLIC_SUPABASE_${suffix}`) ? [] : [`SUPABASE_${suffix}`]);
  if (service.id === 'gemini' && Array.from({ length: 8 }, (_, i) => `GEMINI_API_KEY_${i + 1}`).some(present)) missing = [];
  if (service.id === 'ai' && present('AI_BASE_URL') && isLocalCompatible(env.AI_BASE_URL!, env.AI_LOCAL_BASE_URLS)) missing = missing.filter(name => name !== 'AI_API_KEY');
  if (service.id === 'voidaccess' && !present('VOIDACCESS_API_TOKEN') && !(present('VOIDACCESS_API_EMAIL') && present('VOIDACCESS_API_PASSWORD'))) missing.push('VOIDACCESS_API_TOKEN (or service email and password)');
  const disabled = (service.licence !== undefined && service.licence.commercialUse !== 'yes')
    || (service.id === 'metar' && env.VERIFY_METAR_COMMERCIAL_USE !== 'yes')
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

// Fast local mirror. Routes load durable observations and report storage failures.
const observations = new Map<string, ConnectionObservation>();
export function integrationStatuses(env: Record<string, string | undefined> = process.env) {
  return INTEGRATIONS.map(service => integrationStatus(service, env, observations.get(service.id) ?? null));
}

export async function persistedIntegrationStatuses(env: Record<string, string | undefined> = process.env) {
  const records = await readRuntimeScope<ConnectionObservation>('integration-health');
  return { integrations: INTEGRATIONS.map(service => ({ ...integrationStatus(service, env, records.items[service.id] ?? observations.get(service.id) ?? null), storage: records.storage, storageWarning: records.warning })), observationStorage: records.storage, storageWarning: records.warning };
}

export async function testIntegration(id: string, options: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; now?: () => number } = {}) {
  const service = INTEGRATIONS.find(item => item.id === id);
  if (!service) return null;
  const env = options.env ?? process.env;
  const status = integrationStatus(service, env);
  if (status.status === 'Not configured' || status.status === 'Disabled by licence') return status;
  if (!observations.has(id)) {
    const previous = await readRuntimeScope<ConnectionObservation>('integration-health');
    if (previous.items[id]) observations.set(id, previous.items[id]);
  }
  const now = options.now ?? Date.now;
  const started = now();
  let error: string | null = null;
  const probe = connectionProbe(service, env);
  let connected = false;
  if (probe) {
    // Only compile-time URLs, no user URL, key, Authorization or redirect forwarding.
    try {
      if (options.fetcher) {
        const response = await options.fetcher(probe.url, { signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json', ...probe.headers } });
        await response.body?.cancel(); if (!response.ok) error = `Provider returned HTTP ${response.status}.`;
      } else await runConnectionProbe(probe, env);
      connected = !error;
    } catch { error = 'Connection unavailable or timed out. No credential or upstream error body was logged.'; }
  }
  const checkedAt = new Date(now()).toISOString();
  const observation: ConnectionObservation = {
    checkedAt, lastSuccessAt: connected ? checkedAt : observations.get(id)?.lastSuccessAt ?? null,
    error, latencyMs: Math.max(0, now() - started), scope: probe ? 'connection' : 'configuration',
    message: probe ? error ?? 'Endpoint connection succeeded. This check does not establish current geographic coverage.'
      : 'Configuration checked only. This service does not yet have a safe connection-test adapter; no network request was made.',
  };
  observations.set(id, observation);
  const persistence = await writeRuntimeValue('integration-health', id, observation);
  return { ...integrationStatus(service, env, observation), storage: persistence.storage, storageWarning: persistence.warning };
}
