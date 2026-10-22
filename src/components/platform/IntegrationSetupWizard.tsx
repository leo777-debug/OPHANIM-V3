'use client';
import { useState } from 'react';
import type { IntegrationStatus } from '@/lib/integrations/status';

export default function IntegrationSetupWizard({ integrations, test, pending }: { integrations: IntegrationStatus[]; test: (id: string) => Promise<void>; pending: boolean }) {
  const [kind, setKind] = useState('research'), [step, setStep] = useState(1), [draft, setDraft] = useState(''), [result, setResult] = useState(''), [sending, setSending] = useState(false);
  const service = integrations.find(item => item.id === kind), research = kind === 'research';
  const draftValid = (() => { if (!draft) return true; if (!research) return /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(draft); try { const url = new URL(draft); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && !/[\r\n\s]/.test(draft); } catch { return false; } })();
  const sample = research ? `AI_SANDBOX_RESEARCH_URL=${draftValid ? draft : ''}\nAI_SANDBOX_RESEARCH_TOKEN=\nINTEGRATION_ALLOWED_ORIGINS=` : `SDK_ORGANIZATION_ID=${draftValid ? draft : ''}\nSDK_INGEST_KEY=`;
  const diagnostic = async () => {
    setSending(true); setResult('');
    try {
      const response = await fetch('/api/platform/integrations/sdk-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'SDK test unavailable.');
      setResult(`${body.message} Checked ${body.checkedAt}. Observation storage: ${body.storage}.${body.storageWarning ? ` ${body.storageWarning}` : ''}`);
    } catch (error) { setResult(error instanceof Error ? error.message : 'SDK test unavailable.'); }
    finally { setSending(false); }
  };
  return <section aria-label="Optional service setup" className="platform-detail__block" style={{ marginBlock: 20 }}>
    <h3>Optional service setup · step {step} of 3</h3>
    <label>Service to configure <select value={kind} onChange={event => { setKind(event.target.value); setStep(1); setDraft(''); setResult(''); }}><option value="research">Isolated research sandbox</option><option value="sdk">Private SDK ingestion</option></select></label>
    {step === 1 && <><h4>1. Prepare the service</h4><p>{research ? 'Use the bundled research Compose profile for a restricted, deterministic lookup of official USGS earthquake and US weather-warning feeds. It cannot confirm a claim or establish risk. For broader research, deploy your authorized worker separately with restricted egress and no production database credentials. Both use authenticated GET /health and POST /v1/research; no browser execution runs inside Ophanim.' : 'This deployment accepts your organization’s authorized operational assets. Bind this worker to one organization UUID. The process-local store clears on restart; multiple workers do not share it.'}</p><p>Use permitted disruption, safety and risk information. Public feeds work without this service.</p><a href={research ? '/docs/research-setup' : '/docs/sdk-setup'}>Read the full setup guide</a></>}
    {step === 2 && <><h4>2. Set private server configuration</h4><p>Put credentials only in the server’s uncommitted .env or hosting dashboard, then restart. This wizard accepts no keys and saves no configuration.</p>
      <label>{research ? 'Optional service base URL draft (no credential or query string)' : 'Optional organization UUID draft'} <input value={draft} onChange={event => setDraft(event.target.value)} autoComplete="off" maxLength={500} /></label>
      {!draftValid && <p role="status">{research ? 'Use an HTTP(S) URL without credentials, whitespace, query or fragment.' : 'Enter the organization UUID from your administration records.'}</p>}
      <p>This draft stays in this page. It is not sent to the server or saved. Copy the template privately and fill the blank credential there.</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{sample}</pre>
      {research && <p>For a private HTTP worker, explicitly allow its exact origin in INTEGRATION_ALLOWED_ORIGINS. Remote services should use HTTPS. Never allow metadata endpoints or untrusted origins.</p>}
      <p>Detected configuration: {service?.status ?? 'not loaded'}. Missing: {service?.missing.join(', ') || 'none reported'}. Presence alone does not prove the service is running.</p></>}
    {step === 3 && <><h4>3. Test the configured deployment</h4><p>{research ? 'The test uses the server URL/token and checks the worker health endpoint. It makes no research request. A connection success does not verify isolation, source rights or the worker’s evidence quality.' : 'Send one clearly synthetic diagnostic through the server credential and ingestion validation. It is never stored, mapped or streamed. This does not verify an external sender or cross-worker delivery.'}</p>
      <p role="status">Configuration: {service?.status ?? 'Not loaded'}. {service?.status === 'Not configured' ? `Add ${service.missing.join(', ')} in the private server environment using Admin → Integrations, then restart.` : service?.status === 'Disabled by licence' ? 'Source rights are not approved; this action is disabled.' : ''}</p>
      <button type="button" disabled={pending || sending || !service || service.status === 'Not configured' || service.status === 'Disabled by licence'} onClick={() => research ? void test('research') : void diagnostic()}>{sending ? 'Sending diagnostic…' : research ? 'Test research connection' : 'Send synthetic test event'}</button>
      {research && service?.observation && <p role="status">{service.observation.message} · checked {service.observation.checkedAt} · last successful fetch {service.observation.lastSuccessAt ?? 'never'}</p>}{result && <p role="status">{result}</p>}
      <p>If the service is unavailable, leave it disabled and follow the guide. Keys remain on the server.</p></>}
    <p><button type="button" disabled={step === 1 || sending} onClick={() => setStep(value => value - 1)}>Previous step</button>{' '}<button type="button" disabled={step === 3 || sending || !draftValid} onClick={() => setStep(value => value + 1)}>Next step</button></p>
  </section>;
}
