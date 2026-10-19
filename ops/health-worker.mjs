// Optional self-hosted scheduler. No credentials or upstream response bodies logged.
const interval = Math.max(300, Number(process.env.HEALTH_POLL_SECONDS) || 300) * 1000;
const base = (process.env.APP_INTERNAL_URL || 'http://ophanim:3000').replace(/\/$/, '');
async function check() {
  if (!process.env.HEALTH_CRON_SECRET) { console.log('Health monitor: not configured. Set HEALTH_CRON_SECRET.'); return; }
  try {
    const response = await fetch(`${base}/api/platform/health/cron`, { signal: AbortSignal.timeout(180000), redirect: 'error', headers: { Authorization: `Bearer ${process.env.HEALTH_CRON_SECRET}` } });
    await response.body?.cancel(); console.log(`Health monitor completed: HTTP ${response.status}`);
  } catch { console.log('Health monitor: Ophanim service not running or timed out.'); }
}
await check();
setInterval(check, interval);
