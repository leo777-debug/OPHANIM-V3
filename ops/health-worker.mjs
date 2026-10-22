// Optional self-hosted scheduler. Never persist credentials or upstream bodies.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const REQUEST_TIMEOUT_MS = 180000;
export const STATE_PATH = '/tmp/ophanim-health.json';

export function pollInterval(value) {
  const seconds = Number(value);
  return (Number.isFinite(seconds) && seconds > 0 ? Math.min(86400, Math.max(300, seconds)) : 300) * 1000;
}

/** @param {Record<string, string | undefined>} env */
export function workerConfiguration(env = process.env) {
  const token = env.HEALTH_CRON_SECRET || '';
  if (!token || /[\s\x00-\x1f\x7f]/.test(token)) throw new Error('Health monitor: invalid or missing dedicated secret.');
  let url;
  try { url = new URL(env.APP_INTERNAL_URL || 'http://ophanim:3000'); } catch { throw new Error('Health monitor: invalid application origin.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Health monitor: invalid application origin.');
  }
  return { endpoint: `${url.origin}/api/platform/health/cron`, token, interval: pollInterval(env.HEALTH_POLL_SECONDS) };
}

export function schedulerHealthy(state, interval, now = Date.now()) {
  if (state?.scope !== 'scheduler' || !Number.isFinite(state.lastSuccess) || !Number.isFinite(state.lastAttempt)) return false;
  if (state.outcome !== 'completed' && state.outcome !== 'running') return false;
  const age = now - state.lastSuccess;
  const attemptAge = now - state.lastAttempt;
  return age >= 0 && age <= interval + REQUEST_TIMEOUT_MS + 60000 && attemptAge >= 0 &&
    (state.outcome !== 'running' || attemptAge <= REQUEST_TIMEOUT_MS + 60000);
}

export function saveState(state, path = STATE_PATH) {
  writeFileSync(`${path}.tmp`, JSON.stringify(state), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}

export function createScheduler({ config, fetcher = fetch, now = Date.now, persist = saveState, log = console.log }) {
  let active = null;
  let lastSuccess = null;
  function check() {
    if (active) return active;
    active = (async () => {
      const lastAttempt = now();
      persist({ scope: 'scheduler', lastAttempt, lastSuccess, outcome: 'running' });
      let outcome = 'failed';
      try {
        const response = await fetcher(config.endpoint, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'error',
          headers: { Authorization: `Bearer ${config.token}` } });
        await response.body?.cancel();
        if (response.ok) { lastSuccess = now(); outcome = 'completed'; }
        log(`Health scheduler: HTTP ${response.status}; individual feed health is reported in Admin Health.`);
      } catch { log('Health scheduler: application request failed or timed out.'); }
      persist({ scope: 'scheduler', lastAttempt, lastSuccess, outcome });
    })().finally(() => { active = null; });
    return active;
  }
  return { check };
}

async function main() {
  const config = workerConfiguration();
  if (process.argv.includes('--healthcheck')) {
    let state;
    try { state = JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { /* No successful run yet. */ }
    process.exitCode = schedulerHealthy(state, config.interval) ? 0 : 1;
    return;
  }
  const scheduler = createScheduler({ config });
  // Schedule after completion, so a slow sweep cannot overlap the next one.
  while (true) { await scheduler.check(); await delay(config.interval); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Health scheduler: configuration or heartbeat storage failed.'); process.exitCode = 1; });
}
