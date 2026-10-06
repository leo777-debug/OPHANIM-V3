import { db } from '@/lib/db/pool';
import { criticalEnvironmentIssue, environmentChecks } from '@/lib/config/environment';
import { getProviderCatalog, providerMetrics } from '@/lib/providers';

export async function recordJobRun(jobKey: string, status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled', details: { organizationId?: string; attempt?: number; durationMs?: number; error?: string; metadata?: Record<string, unknown> } = {}) {
  await db().query(`insert into ophanim_job_runs(job_key,organization_id,status,attempt,duration_ms,error,metadata,started_at,completed_at) values($1,$2,$3,$4,$5,$6,$7,case when $3='running' then now() else null end,case when $3 in ('completed','failed','cancelled') then now() else null end)`, [jobKey, details.organizationId ?? null, status, details.attempt ?? 1, details.durationMs ?? null, details.error ?? null, JSON.stringify(details.metadata ?? {})]);
}

export async function platformHealth() {
  let database: 'healthy' | 'unhealthy' = 'healthy';
  let databaseError: string | undefined;
  try { await db().query('select 1'); } catch (error) { database = 'unhealthy'; databaseError = error instanceof Error ? error.message : 'Database unavailable'; }
  const providers = getProviderCatalog().map((provider) => ({ id: provider.id, configured: provider.configured, status: provider.health.status, metrics: providerMetrics.get(provider.id) }));
  const latestJobs = database === 'healthy' ? (await db().query(`select distinct on (job_key) job_key,status,created_at,error,duration_ms from ophanim_job_runs order by job_key,created_at desc`)).rows : [];
  const environmentIssue = criticalEnvironmentIssue();
  return {
    status: database === 'healthy' && !environmentIssue ? 'healthy' : 'degraded',
    platform: 'OPHANIM',
    version: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? 'development',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: { status: database, ...(databaseError ? { error: databaseError } : {}) },
    environment: environmentChecks().map(({ name, configured, required }) => ({ name, configured, required })),
    providers,
    jobs: latestJobs,
  };
}
