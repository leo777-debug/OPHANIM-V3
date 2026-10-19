import { INTEGRATIONS } from './catalog';
import { persistedIntegrationStatuses, testIntegration } from './status';
import { readRuntimeScope, writeRuntimeValue } from '@/lib/runtime/store';
import { Resend } from 'resend';

type FailureState = { since: string; alertedAt: string | null };
export async function runIntegrationHealthJob(now = Date.now()) {
  const previous = await readRuntimeScope<FailureState>('integration-failures');
  const results = [];
  // Bounded concurrency; missing/licence-disabled configurations make no requests.
  for (let offset = 0; offset < INTEGRATIONS.length; offset += 4) results.push(...await Promise.all(INTEGRATIONS.slice(offset, offset + 4).map(service => testIntegration(service.id))));
  const critical = (process.env.HEALTH_CRITICAL_INTEGRATIONS ?? 'usgs,nasa,cisa').split(',').map(id => id.trim());
  const threshold = Math.max(5, Number(process.env.HEALTH_ALERT_AFTER_MINUTES) || 30) * 60000;
  const failures: string[] = [];
  for (const result of results) {
    if (!result || !critical.includes(result.id)) continue;
    if (result.status !== 'Error') { if (result.observation?.scope === 'connection' && !result.observation.error) await writeRuntimeValue('integration-failures', result.id, { since: '', alertedAt: null }); continue; }
    const state = previous.items[result.id]?.since ? previous.items[result.id] : { since: new Date(now).toISOString(), alertedAt: null };
    if (now - Date.parse(state.since) >= threshold && !state.alertedAt) failures.push(result.id);
    await writeRuntimeValue('integration-failures', result.id, state);
  }
  let email: 'not-needed' | 'not-configured' | 'sent' | 'error' = failures.length ? 'not-configured' : 'not-needed';
  if (failures.length && process.env.RESEND_API_KEY && process.env.RESEND_FROM && process.env.HEALTH_ADMIN_EMAILS) {
    try {
      const response = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: process.env.RESEND_FROM, to: process.env.HEALTH_ADMIN_EMAILS.split(',').map(address => address.trim()).filter(Boolean), subject: 'Ophanim: sustained critical feed failure', text: `Critical feed connection tests have failed beyond the configured threshold: ${failures.join(', ')}. Open Admin → Health for source evidence. This is a health observation, not proof of regional disruption.` });
      if (response.error) throw new Error('Delivery failed');
      email = 'sent'; for (const id of failures) await writeRuntimeValue('integration-failures', id, { since: previous.items[id]?.since || new Date(now).toISOString(), alertedAt: new Date(now).toISOString() });
    } catch { email = 'error'; }
  }
  await writeRuntimeValue('jobs', 'integration-health', { checkedAt: new Date(now).toISOString(), count: results.length, email });
  return { ...await persistedIntegrationStatuses(), email, criticalFailures: failures };
}
