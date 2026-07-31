'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, LoaderCircle, MapPinned, Radar, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { DisruptionInput } from '@/lib/logistics/disruption-validation';
import type { DisruptionRecord, ShipmentImpactAssessment } from '@/lib/logistics/disruptions';

const blank: DisruptionInput = { source: '', title: '', disruptionType: 'port_closure', severity: 3, status: 'active' };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Request failed.');
  return body as T;
}

function list(value: string): string[] | undefined {
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

export default function DisruptionWorkspace() {
  const router = useRouter();
  const [disruptions, setDisruptions] = useState<DisruptionRecord[]>([]);
  const [selected, setSelected] = useState<DisruptionRecord | null>(null);
  const [assessments, setAssessments] = useState<ShipmentImpactAssessment[]>([]);
  const [form, setForm] = useState<DisruptionInput>(blank);
  const [ports, setPorts] = useState('');
  const [vessels, setVessels] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setDisruptions((await requestJson<{ disruptions: DisruptionRecord[] }>('/api/logistics/disruptions')).disruptions); }
    catch (loadError) {
      if (loadError instanceof Error && loadError.message === 'Authentication is required.') router.replace('/login');
      else setError(loadError instanceof Error ? loadError.message : 'Unable to load disruptions.');
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const open = async (disruption: DisruptionRecord) => {
    setError('');
    try {
      const detail = await requestJson<{ disruption: DisruptionRecord; assessments: ShipmentImpactAssessment[] }>(`/api/logistics/disruptions/${disruption.id}`);
      setSelected(detail.disruption); setAssessments(detail.assessments);
    } catch (openError) { setError(openError instanceof Error ? openError.message : 'Unable to load disruption.'); }
  };

  const create = async () => {
    setSaving(true); setError('');
    try {
      const evidence = evidenceUrl.trim() ? [{ sourceName: form.source, title: form.title, sourceUrl: evidenceUrl.trim() }] : undefined;
      const created = await requestJson<{ disruption: DisruptionRecord }>('/api/logistics/disruptions', { method: 'POST', body: JSON.stringify({ ...form, affectedPorts: list(ports), affectedVessels: list(vessels), evidence }) });
      setForm(blank); setPorts(''); setVessels(''); setEvidenceUrl(''); await load(); await open(created.disruption);
    } catch (createError) { setError(createError instanceof Error ? createError.message : 'Unable to create disruption.'); }
    finally { setSaving(false); }
  };

  const reconcile = async () => {
    if (!selected) return;
    setSaving(true); setError('');
    try { setAssessments((await requestJson<{ assessments: ShipmentImpactAssessment[] }>(`/api/logistics/disruptions/${selected.id}/reconcile`, { method: 'POST', body: '{}' })).assessments); await load(); }
    catch (reconcileError) { setError(reconcileError instanceof Error ? reconcileError.message : 'Unable to assess shipment impacts.'); }
    finally { setSaving(false); }
  };

  if (loading) return <main className="grid min-h-screen place-items-center bg-[var(--bg-void)] text-[var(--text-primary)]"><LoaderCircle className="h-5 w-5 animate-spin" /></main>;

  return <main className="min-h-screen bg-[var(--bg-void)] p-4 font-mono text-[var(--text-primary)] md:p-8"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-secondary)] pb-5"><div><p className="text-[10px] uppercase tracking-[0.18em] text-[var(--cyan-primary)]">Logistics Operations</p><h1 className="mt-1 text-2xl font-semibold">Disruptions</h1></div><div className="flex gap-2"><Link href="/logistics" className="border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)]">Shipments</Link><Link href="/logistics/rescue" className="border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)]">Rescue cases</Link></div></header>
    {error && <p className="mt-4 border border-[var(--alert-red)] px-3 py-2 text-xs text-[var(--alert-red)]">{error}</p>}
    <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"><section className="border border-[var(--border-secondary)]"><div className="border-b border-[var(--border-secondary)] px-4 py-3"><h2 className="text-sm">Recorded disruptions</h2></div><div className="divide-y divide-[var(--border-secondary)]">{disruptions.length === 0 && <p className="p-4 text-xs text-[var(--text-muted)]">No organization disruptions recorded.</p>}{disruptions.map((item) => <button key={item.id} onClick={() => void open(item)} className="w-full p-4 text-left hover:bg-[var(--hover-accent)]"><div className="flex items-start justify-between gap-3"><div><p className="text-sm">{item.title}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{item.source} · {item.disruptionType.replace('_', ' ')} · severity {item.severity}</p></div><span className="text-xs text-[var(--cyan-primary)]">{item.impactCount ?? 0} impacts</span></div></button>)}</div></section>
      <section className="border border-[var(--border-secondary)] p-4"><h2 className="text-sm">Record disruption</h2><DisruptionForm form={form} setForm={setForm} ports={ports} setPorts={setPorts} vessels={vessels} setVessels={setVessels} evidenceUrl={evidenceUrl} setEvidenceUrl={setEvidenceUrl} onSave={create} saving={saving} /></section></section>
    {selected && <section className="mt-6 border border-[var(--border-secondary)] p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.16em] text-[var(--cyan-primary)]">Disruption assessment</p><h2 className="mt-1 text-lg">{selected.title}</h2><p className="mt-2 max-w-3xl text-xs text-[var(--text-muted)]">{selected.description || 'No additional description recorded.'}</p></div><div className="flex gap-2">{selected.latitude !== undefined && selected.longitude !== undefined && <Link href={`/?lat=${selected.latitude}&lng=${selected.longitude}&zoom=8`} className="border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)]"><MapPinned className="mr-1 inline h-3.5 w-3.5" />Map location</Link>}<button disabled={saving} onClick={() => void reconcile()} className="bg-[var(--cyan-primary)] px-3 py-2 text-xs text-black disabled:opacity-50"><Radar className="mr-1 inline h-3.5 w-3.5" />{saving ? 'Assessing' : 'Run deterministic match'}</button></div></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_300px]"><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="border-y border-[var(--border-secondary)] text-[var(--text-muted)]"><tr><th className="p-3">Shipment</th><th className="p-3">State</th><th className="p-3">Score</th><th className="p-3">Evidence</th><th className="p-3">Last safe move</th></tr></thead><tbody>{assessments.length === 0 && <tr><td colSpan={5} className="p-3 text-[var(--text-muted)]">Run the deterministic match to create an assessment.</td></tr>}{assessments.map((assessment) => <tr key={assessment.id} className="border-b border-[var(--border-secondary)]"><td className="p-3"><Link className="text-[var(--cyan-primary)]" href={`/logistics/shipments/${assessment.shipmentId}`}>{assessment.shipmentReference}</Link></td><td className="p-3 uppercase">{assessment.impactStatus} / {assessment.riskLevel}</td><td className="p-3">{assessment.impactScore}</td><td className="p-3">{assessment.matchedSignals.map((signal) => signal.value).join(', ')}</td><td className="p-3">{assessment.lastSafeMoveAt ? <span title={assessment.lastSafeMoveSource}>{new Date(assessment.lastSafeMoveAt).toLocaleString()}</span> : 'No known pre-disruption move'}</td></tr>)}</tbody></table></div><aside className="border border-[var(--border-secondary)] p-3 text-xs"><p className="text-[var(--text-muted)]">Evidence</p>{selected.evidence.length === 0 && <p className="mt-2 text-[var(--text-muted)]">No evidence link recorded.</p>}{selected.evidence.map((evidence) => <a key={evidence.id} className="mt-3 block text-[var(--cyan-primary)]" href={evidence.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 inline h-3 w-3" />{evidence.title}</a>)}{selected.sourceUrl && <a className="mt-3 block text-[var(--cyan-primary)]" href={selected.sourceUrl} target="_blank" rel="noreferrer">Primary source</a>}</aside></div>
    </section>}
  </div></main>;
}

function DisruptionForm({ form, setForm, ports, setPorts, vessels, setVessels, evidenceUrl, setEvidenceUrl, onSave, saving }: { form: DisruptionInput; setForm: (value: DisruptionInput) => void; ports: string; setPorts: (value: string) => void; vessels: string; setVessels: (value: string) => void; evidenceUrl: string; setEvidenceUrl: (value: string) => void; onSave: () => void; saving: boolean }) {
  const change = (field: keyof DisruptionInput, value: string | number) => setForm({ ...form, [field]: value });
  return <div className="mt-4 grid gap-3"><Field label="Source" value={form.source} onChange={(value) => change('source', value)} /><Field label="Title" value={form.title} onChange={(value) => change('title', value)} /><label className="text-xs text-[var(--text-muted)]">Type<select value={form.disruptionType} onChange={(event) => change('disruptionType', event.target.value)} className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-2 text-[var(--text-primary)]">{['port_closure', 'security', 'weather', 'cyber', 'infrastructure', 'labor', 'other'].map((type) => <option key={type}>{type.replace('_', ' ')}</option>)}</select></label><label className="text-xs text-[var(--text-muted)]">Severity<select value={form.severity} onChange={(event) => change('severity', Number(event.target.value))} className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-2 text-[var(--text-primary)]">{[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}</option>)}</select></label><Field label="Affected ports (comma separated)" value={ports} onChange={setPorts} /><Field label="Affected vessels or IMO (comma separated)" value={vessels} onChange={setVessels} /><Field label="Evidence URL" value={evidenceUrl} onChange={setEvidenceUrl} /><button disabled={saving} onClick={onSave} className="bg-[var(--cyan-primary)] px-3 py-2 text-xs text-black disabled:opacity-50"><Save className="mr-1 inline h-3.5 w-3.5" />{saving ? 'Saving' : 'Record disruption'}</button></div>;
}

function Field({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return <label className="text-xs text-[var(--text-muted)]">{label}<input value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-2 text-[var(--text-primary)]" /></label>;
}
