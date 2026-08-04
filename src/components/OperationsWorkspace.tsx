'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, ClipboardCheck, ExternalLink, FileUp, RefreshCw, ShieldAlert, ShipWheel, Wrench } from 'lucide-react';
import type { IntelligenceAlert, IntelligenceDeliveryLog, IntelligenceQueueItem, OperationalTask } from '@/lib/intelligence/operations';

type Edition = 'all' | 'logistics' | 'cyber';
type Dashboard = Record<string, number>;
type Settings = { email: string; enabled: boolean; mode: 'immediate' | 'digest'; digestMinutes: number; minimumConfidence: number };

const request = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Request failed.');
  return body;
};

const label = (value: string) => value.replaceAll('_', ' ');

export default function OperationsWorkspace({ edition = 'all' }: { edition?: Edition }) {
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [queue, setQueue] = useState<IntelligenceQueueItem[]>([]);
  const [alerts, setAlerts] = useState<IntelligenceAlert[]>([]);
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [deliveries, setDeliveries] = useState<IntelligenceDeliveryLog[]>([]);
  const [settings, setSettings] = useState<Settings>({ email: '', enabled: false, mode: 'immediate', digestMinutes: 30, minimumConfidence: 55 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [summary, reviews, alertList, taskList, notificationSettings, deliveryLog] = await Promise.all([
        request<{ dashboard: Dashboard }>('/api/intelligence/dashboard'), request<{ items: IntelligenceQueueItem[] }>('/api/intelligence/queue'), request<{ alerts: IntelligenceAlert[] }>('/api/intelligence/alerts'), request<{ tasks: OperationalTask[] }>('/api/intelligence/tasks'), request<{ settings: Settings }>('/api/intelligence/settings'), request<{ deliveries: IntelligenceDeliveryLog[] }>('/api/intelligence/deliveries'),
      ]);
      setDashboard(summary.dashboard); setQueue(reviews.items); setAlerts(alertList.alerts); setTasks(taskList.tasks); setSettings(notificationSettings.settings); setDeliveries(deliveryLog.deliveries);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Operations data is unavailable.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleAlerts = useMemo(() => edition === 'all' ? alerts : alerts.filter((alert) => alert.category === edition), [alerts, edition]);
  const visibleQueue = useMemo(() => edition === 'all' ? queue : queue.filter((item) => item.subjectType === (edition === 'logistics' ? 'shipment' : undefined) || (edition === 'cyber' && item.subjectType !== 'shipment')), [edition, queue]);
  const visibleTasks = useMemo(() => edition === 'all' ? tasks : tasks.filter((task) => edition === 'logistics' ? task.workflowType === 'shipment_exposure' || task.workflowType === 'rescue_case' : task.workflowType === 'cyber_exposure' || task.workflowType === 'roll_call'), [edition, tasks]);

  const act = async (work: () => Promise<unknown>) => { setBusy(true); setError(''); try { await work(); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed.'); } finally { setBusy(false); } };
  const reconcile = () => act(() => request('/api/intelligence/reconcile', { method: 'POST' }));
  const review = (mentionId: string, reviewStatus: string, selectedAssessmentId?: string) => act(() => request(`/api/intelligence/queue/${mentionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewStatus, selectedAssessmentId }) }));
  const alert = (id: string, status: string) => act(() => request(`/api/intelligence/alerts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }));
  const completeTask = (id: string) => act(() => request(`/api/intelligence/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskStatus: 'completed', completionNote: 'Completed from the operations workspace.' }) }));
  const startRescue = (assessmentId: string) => act(() => request(`/api/intelligence/assessments/${assessmentId}/rescue`, { method: 'POST' }));
  const startRemediation = (assessmentId: string) => act(() => request(`/api/intelligence/assessments/${assessmentId}/remediation`, { method: 'POST' }));
  const saveSettings = () => act(() => request('/api/intelligence/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }));

  const title = edition === 'all' ? 'Operations workspace' : edition === 'logistics' ? 'Logistics control' : 'Cyber response control';
  return <main className="min-h-screen overflow-y-auto bg-[var(--bg-void)] px-5 py-8 text-[var(--text-primary)] md:px-10">
    <div className="mx-auto max-w-7xl pb-12">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[var(--border-secondary)] pb-5">
        <div><p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--cyan-primary)]">Ophanim operations</p><h1 className="mt-2 text-3xl font-semibold text-[var(--text-heading)]">{title}</h1><p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">Evidence-led triage for unverified intelligence signals. Scores describe evidence strength, not a claim of fact.</p></div>
        <div className="flex flex-wrap gap-2"><a href="/imports" className="inline-flex items-center gap-2 border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)]"><FileUp className="h-4 w-4" />Imports</a>{edition !== 'logistics' && <a href="/logistics/control" className="inline-flex items-center gap-2 border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)]"><ShipWheel className="h-4 w-4" />Logistics</a>}<a href="/logistics/rescue" className="inline-flex items-center gap-2 border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)]"><ShipWheel className="h-4 w-4" />Rescue</a><button disabled={busy} onClick={reconcile} className="inline-flex items-center gap-2 border border-[var(--cyan-primary)] bg-[var(--cyan-primary)] px-3 py-2 text-xs font-medium text-[var(--bg-void)] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Reconcile signals</button></div>
      </header>

      {error && <p role="alert" className="mt-5 border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Open alerts" value={edition === 'logistics' ? dashboard.logistics_alerts : edition === 'cyber' ? dashboard.cyber_alerts : dashboard.open_alerts} accent="alert" /><Metric label="Needs triage" value={dashboard.triage} accent="cyan" /><Metric label="Open tasks" value={dashboard.open_tasks} accent="cyan" /><Metric label={edition === 'cyber' ? 'Active roll calls' : 'Active rescue cases'} value={edition === 'cyber' ? dashboard.roll_calls : dashboard.rescue_cases} accent="alert" /></section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <div className="space-y-6">
          <Panel title="Priority alerts" icon={Bell} detail="Acknowledge, mute, snooze, or close an operational alert after review.">
            {loading ? <Empty text="Loading alerts" /> : visibleAlerts.length === 0 ? <Empty text="No active alerts for this workspace." /> : <div className="divide-y divide-[var(--border-secondary)]">{visibleAlerts.map((item) => <article key={item.id} className="py-4 first:pt-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium text-[var(--cyan-primary)]">{item.category} · {item.confidenceLevel} confidence · {item.confidenceScore}/100</p><h2 className="mt-1 text-base font-medium">{item.subjectLabel}</h2><p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">{item.summary}</p><p className="mt-2 text-xs text-[var(--text-muted)]">Source: {item.sourceName} {item.sourceReference && <a className="ml-2 text-[var(--cyan-primary)] underline" href={item.sourceReference} target="_blank" rel="noreferrer">Open source <ExternalLink className="inline h-3 w-3" /></a>}</p></div><span className="border border-[var(--border-secondary)] px-2 py-1 text-[10px] uppercase text-[var(--text-muted)]">{label(item.status)}</span></div><div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => alert(item.id, 'acknowledged')} className="border border-[var(--cyan-primary)] px-2.5 py-1.5 text-xs text-[var(--cyan-primary)]">Acknowledge</button><button disabled={busy} onClick={() => act(() => request(`/api/intelligence/alerts/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'snoozed', snoozedUntil: new Date(Date.now() + 3_600_000).toISOString() }) }))} className="border border-[var(--border-secondary)] px-2.5 py-1.5 text-xs">Snooze 1h</button><button disabled={busy} onClick={() => alert(item.id, 'muted')} className="border border-[var(--border-secondary)] px-2.5 py-1.5 text-xs">Mute</button><button disabled={busy} onClick={() => alert(item.id, 'closed')} className="border border-[var(--border-secondary)] px-2.5 py-1.5 text-xs">Close</button><a className="border border-[var(--border-secondary)] px-2.5 py-1.5 text-xs" href="/">Map</a></div></article>)}</div>}
          </Panel>
          <Panel title="Analyst review queue" icon={ClipboardCheck} detail="Confirm the identity match, not the claim itself. Weak or ambiguous matches stay in review.">
            {loading ? <Empty text="Loading review queue" /> : visibleQueue.length === 0 ? <Empty text="No items require review." /> : <div className="divide-y divide-[var(--border-secondary)]">{visibleQueue.map((item) => <article key={item.mentionId} className="py-4 first:pt-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-[var(--text-muted)]">{item.sourceName} · {item.confidenceLevel ?? 'insufficient'} confidence {item.confidenceScore !== undefined ? `${item.confidenceScore}/100` : ''}</p><h2 className="mt-1 text-base font-medium">{item.subjectLabel ?? item.title ?? 'Unassigned intelligence signal'}</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Status: {label(item.reviewStatus)}{item.subjectType ? ` · ${label(item.subjectType)}` : ''}</p>{(item.nextMilestoneAt || item.lastSafeMoveAt) && <p className="mt-1 text-xs text-[var(--text-muted)]">{item.nextMilestoneAt && `Next milestone: ${new Date(item.nextMilestoneAt).toLocaleString()}`}{item.nextMilestoneAt && item.lastSafeMoveAt && ' · '}{item.lastSafeMoveAt && `Last safe move: ${new Date(item.lastSafeMoveAt).toLocaleString()}${item.lastSafeMoveSource ? ` (${item.lastSafeMoveSource})` : ''}`}</p>}</div>{item.sourceReference && <a href={item.sourceReference} target="_blank" rel="noreferrer" className="text-xs text-[var(--cyan-primary)]">Source <ExternalLink className="inline h-3 w-3" /></a>}</div><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy || !item.assessmentId} onClick={() => review(item.mentionId, 'likely_relevant', item.assessmentId)} className="border border-[var(--cyan-primary)] px-2.5 py-1.5 text-xs text-[var(--cyan-primary)]">Confirm identity</button><button disabled={busy} onClick={() => review(item.mentionId, 'false_positive')} className="border border-[var(--border-secondary)] px-2.5 py-1.5 text-xs">False positive</button><button disabled={busy} onClick={() => review(item.mentionId, 'monitoring')} className="border border-[var(--border-secondary)] px-2.5 py-1.5 text-xs">Monitor</button>{item.subjectType === 'shipment' && item.assessmentId && <button disabled={busy} onClick={() => startRescue(item.assessmentId!)} className="border border-[var(--alert-orange)] px-2.5 py-1.5 text-xs text-[var(--alert-orange)]">Start rescue</button>}{item.subjectType && item.subjectType !== 'shipment' && item.assessmentId && <button disabled={busy} onClick={() => startRemediation(item.assessmentId!)} className="border border-[var(--alert-orange)] px-2.5 py-1.5 text-xs text-[var(--alert-orange)]">Open remediation room</button>}</div></article>)}</div>}
          </Panel>
        </div>
        <aside className="space-y-6">
          <Panel title="Response tasks" icon={Wrench} detail="The next action is tied to the signal assessment or existing rescue/roll-call workflow.">
            {loading ? <Empty text="Loading tasks" /> : visibleTasks.length === 0 ? <Empty text="No open tasks." /> : <div className="space-y-3">{visibleTasks.slice(0, 12).map((task) => <article key={task.id} className="border border-[var(--border-secondary)] p-3"><p className="text-[10px] uppercase text-[var(--text-muted)]">{label(task.workflowType)} · {task.priority}</p><h2 className="mt-1 text-sm font-medium">{task.title}</h2>{task.dueAt && <p className="mt-1 text-xs text-[var(--text-muted)]">Due {new Date(task.dueAt).toLocaleString()}</p>}<div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-[var(--cyan-primary)]">{label(task.taskStatus)}</span>{task.taskStatus !== 'completed' && <button disabled={busy} onClick={() => completeTask(task.id)} className="text-xs text-[var(--cyan-primary)]">Mark complete</button>}</div></article>)}</div>}
          </Panel>
          <Panel title="Email delivery" icon={ShieldAlert} detail="Immediate alerts or a 30/60-minute digest. Email contains safe summaries, affected entities, links, and provider sources only.">
            <div className="grid gap-3"><label className="text-xs text-[var(--text-muted)]">Delivery email<input value={settings.email} onChange={(event) => setSettings((current) => ({ ...current, email: event.target.value }))} className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-2 text-sm text-[var(--text-primary)]" placeholder="alerts@example.com" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} />Enable delivery</label><label className="text-xs text-[var(--text-muted)]">Mode<select value={settings.mode} onChange={(event) => setSettings((current) => ({ ...current, mode: event.target.value as Settings['mode'] }))} className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-2 text-sm text-[var(--text-primary)]"><option value="immediate">Immediate alerts</option><option value="digest">Scheduled digest</option></select></label>{settings.mode === 'digest' && <label className="text-xs text-[var(--text-muted)]">Digest interval<select value={settings.digestMinutes} onChange={(event) => setSettings((current) => ({ ...current, digestMinutes: Number(event.target.value) }))} className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-2 text-sm text-[var(--text-primary)]"><option value={30}>30 minutes</option><option value={60}>1 hour</option></select></label>}<label className="text-xs text-[var(--text-muted)]">Minimum confidence<select value={settings.minimumConfidence} onChange={(event) => setSettings((current) => ({ ...current, minimumConfidence: Number(event.target.value) }))} className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-2 text-sm text-[var(--text-primary)]"><option value={30}>Low (30+)</option><option value={55}>Medium (55+)</option><option value={75}>High (75+)</option></select></label><button disabled={busy} onClick={saveSettings} className="border border-[var(--cyan-primary)] px-3 py-2 text-xs text-[var(--cyan-primary)] disabled:opacity-50">Save delivery settings</button></div>
          </Panel>
          <Panel title="Delivery log" icon={CheckCircle2} detail="Failed sends retry with exponential backoff up to five attempts.">
            {loading ? <Empty text="Loading delivery log" /> : deliveries.length === 0 ? <Empty text="No delivery attempts yet." /> : <div className="space-y-2">{deliveries.slice(0, 8).map((delivery) => <div key={delivery.id} className="border border-[var(--border-secondary)] p-3 text-xs"><p className="font-medium">{delivery.subjectLabel}</p><p className="mt-1 text-[var(--text-muted)]">{delivery.kind} · {delivery.status} · {delivery.attempts} attempt{delivery.attempts === 1 ? '' : 's'}</p>{delivery.error && <p className="mt-1 text-red-200">{delivery.error}</p>}</div>)}</div>}
          </Panel>
        </aside>
      </section>
    </div>
  </main>;
}

function Panel({ title, icon: Icon, detail, children }: { title: string; icon: typeof Bell; detail: string; children: React.ReactNode }) { return <section className="border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-5"><div className="flex gap-3"><Icon className="mt-0.5 h-4 w-4 text-[var(--cyan-primary)]" /><div><h2 className="text-base font-medium">{title}</h2><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{detail}</p></div></div><div className="mt-5">{children}</div></section>; }
function Metric({ label, value, accent }: { label: string; value?: number; accent: 'cyan' | 'alert' }) { return <div className="border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-4"><p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p><p className={`mt-2 text-3xl font-semibold ${accent === 'alert' ? 'text-[var(--alert-orange)]' : 'text-[var(--cyan-primary)]'}`}>{value ?? 0}</p></div>; }
function Empty({ text }: { text: string }) { return <p className="border border-dashed border-[var(--border-secondary)] p-4 text-sm text-[var(--text-muted)]">{text}</p>; }
