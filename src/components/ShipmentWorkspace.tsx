'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, LoaderCircle, Plus, Save, Upload } from 'lucide-react';
import { SHIPMENT_IMPORT_FIELDS, type ShipmentColumnMapping, type ShipmentImportField, type ShipmentImportPreview } from '@/lib/logistics/csv-import';
import type { ShipmentInput } from '@/lib/logistics/types';
import type { ShipmentRecord } from '@/lib/logistics/shipments';

const emptyShipment: ShipmentInput = { shipmentReference: '', operationalTimezone: 'UTC', priority: 3, currentStatus: 'planned' };
const labels: Record<ShipmentImportField, string> = {
  shipmentReference: 'Shipment reference', bookingNumber: 'Booking number', containerNumber: 'Container number', billOfLadingReference: 'Bill of lading',
  carrier: 'Carrier', vesselName: 'Vessel', imoNumber: 'IMO', originPortName: 'Origin port', originPortCode: 'Origin code',
  destinationPortName: 'Destination port', destinationPortCode: 'Destination code', operationalTimezone: 'Timezone',
  plannedDepartureAt: 'Planned departure', plannedArrivalAt: 'Planned arrival', actualDepartureAt: 'Actual departure', actualArrivalAt: 'Actual arrival',
  cargoType: 'Cargo type', priority: 'Priority', currentStatus: 'Status',
};

function asForm(shipment: ShipmentRecord): ShipmentInput {
  return {
    shipmentReference: shipment.shipmentReference,
    bookingNumber: shipment.bookingNumber,
    containerNumber: shipment.containerNumber,
    billOfLadingReference: shipment.billOfLadingReference,
    carrier: shipment.carrier,
    vesselName: shipment.vesselName,
    imoNumber: shipment.imoNumber,
    originPortName: shipment.originPortName,
    originPortCode: shipment.originPortCode,
    destinationPortName: shipment.destinationPortName,
    destinationPortCode: shipment.destinationPortCode,
    operationalTimezone: shipment.operationalTimezone,
    plannedDepartureAt: shipment.plannedDepartureAt,
    plannedArrivalAt: shipment.plannedArrivalAt,
    actualDepartureAt: shipment.actualDepartureAt,
    actualArrivalAt: shipment.actualArrivalAt,
    cargoType: shipment.cargoType,
    priority: shipment.priority,
    currentStatus: shipment.currentStatus,
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Request failed.');
  return body as T;
}

export default function ShipmentWorkspace({ shipmentId }: { shipmentId?: string }) {
  const router = useRouter();
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [shipment, setShipment] = useState<ShipmentRecord | null>(null);
  const [form, setForm] = useState<ShipmentInput>(emptyShipment);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [csv, setCsv] = useState<{ fileName: string; text: string } | null>(null);
  const [preview, setPreview] = useState<ShipmentImportPreview | null>(null);
  const [shipmentImportId, setShipmentImportId] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ShipmentColumnMapping>({});
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const actor = await requestJson('/api/auth/me');
      if (!actor) return;
      if (shipmentId) {
        const data = await requestJson<{ shipment: ShipmentRecord }>(`/api/logistics/shipments/${shipmentId}`);
        setShipment(data.shipment);
        setForm(asForm(data.shipment));
      } else {
        const data = await requestJson<{ shipments: ShipmentRecord[] }>('/api/logistics/shipments');
        setShipments(data.shipments);
      }
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === 'Authentication is required.') router.replace('/login');
      else setError(loadError instanceof Error ? loadError.message : 'Unable to load shipments.');
    } finally { setLoading(false); }
  }, [router, shipmentId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const updateForm = (field: keyof ShipmentInput, value: string | number) => setForm((current) => ({ ...current, [field]: value }));

  const saveShipment = async () => {
    setSaving(true); setError('');
    try {
      if (shipmentId) {
        const data = await requestJson<{ shipment: ShipmentRecord }>(`/api/logistics/shipments/${shipmentId}`, { method: 'PATCH', body: JSON.stringify(form) });
        setShipment(data.shipment); setForm(asForm(data.shipment));
      } else {
        const data = await requestJson<{ shipment: ShipmentRecord }>('/api/logistics/shipments', { method: 'POST', body: JSON.stringify(form) });
        router.push(`/logistics/shipments/${data.shipment.id}`);
      }
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save shipment.'); }
    finally { setSaving(false); }
  };

  const previewCsv = async (nextMapping = mapping) => {
    if (!csv) return;
    setImporting(true); setError('');
    try {
      const data = await requestJson<{ shipmentImport: { id: string }; preview: ShipmentImportPreview }>('/api/logistics/shipments/imports/preview', {
        method: 'POST', body: JSON.stringify({ fileName: csv.fileName, csv: csv.text, mapping: Object.keys(nextMapping).length ? nextMapping : undefined }),
      });
      setPreview(data.preview); setShipmentImportId(data.shipmentImport.id); setMapping(data.preview.mapping);
    } catch (previewError) { setError(previewError instanceof Error ? previewError.message : 'Unable to preview import.'); }
    finally { setImporting(false); }
  };

  const confirmImport = async () => {
    if (!shipmentImportId) return;
    setImporting(true); setError('');
    try {
      await requestJson(`/api/logistics/shipments/imports/${shipmentImportId}/confirm`, { method: 'POST', body: '{}' });
      setCsv(null); setPreview(null); setShipmentImportId(null); setMapping({});
      await load();
    } catch (confirmError) { setError(confirmError instanceof Error ? confirmError.message : 'Unable to confirm import.'); }
    finally { setImporting(false); }
  };

  const isDetail = Boolean(shipmentId);
  const rowErrors = useMemo(() => preview?.rows.filter((row) => row.status !== 'valid').slice(0, 8) ?? [], [preview]);

  if (loading) return <main className="min-h-screen bg-[var(--bg-void)] text-[var(--text-primary)] grid place-items-center"><LoaderCircle className="w-5 h-5 animate-spin" /></main>;

  return (
    <main className="min-h-screen bg-[var(--bg-void)] text-[var(--text-primary)] p-4 md:p-8 font-mono">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-secondary)] pb-5">
          <div><p className="text-[10px] uppercase tracking-[0.18em] text-[var(--cyan-primary)]">Logistics Operations</p><h1 className="mt-1 text-2xl font-semibold">{isDetail ? shipment?.shipmentReference ?? 'Shipment' : 'Shipments'}</h1></div>
          <div className="flex gap-2"><Link className="border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)]" href="/logistics">Shipment list</Link><Link className="border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)]" href="/logistics/disruptions">Disruptions</Link><Link className="border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)]" href="/logistics/rescue">Rescue</Link><Link className="bg-[var(--cyan-primary)] px-3 py-2 text-xs text-black" href="/logistics?new=1"><Plus className="mr-1 inline h-3.5 w-3.5" />New shipment</Link></div>
        </header>
        {error && <p className="mt-4 border border-[var(--alert-red)] px-3 py-2 text-xs text-[var(--alert-red)]">{error}</p>}

        {!isDetail && <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="border border-[var(--border-secondary)]">
            <div className="flex items-center justify-between border-b border-[var(--border-secondary)] px-4 py-3"><h2 className="text-sm">Active shipments</h2><span className="text-xs text-[var(--text-muted)]">{shipments.length}</span></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="text-[var(--text-muted)]"><tr><th className="p-3">Reference</th><th className="p-3">Carrier</th><th className="p-3">Route</th><th className="p-3">Arrival</th><th className="p-3">Status</th></tr></thead><tbody>{shipments.map((item) => <tr key={item.id} className="border-t border-[var(--border-secondary)] hover:bg-[var(--hover-accent)]"><td className="p-3"><Link className="text-[var(--cyan-primary)]" href={`/logistics/shipments/${item.id}`}>{item.shipmentReference}</Link></td><td className="p-3">{item.carrier ?? '—'}</td><td className="p-3">{[item.originPortName, item.destinationPortName].filter(Boolean).join(' to ') || '—'}</td><td className="p-3">{item.plannedArrivalAt ? new Date(item.plannedArrivalAt).toLocaleString() : '—'}</td><td className="p-3 uppercase">{item.currentStatus}</td></tr>)}</tbody></table></div>
          </div>
          <section className="border border-[var(--border-secondary)] p-4"><h2 className="text-sm">Create shipment</h2><ShipmentForm form={form} onChange={updateForm} onSave={saveShipment} saving={saving} /></section>
        </section>}

        {isDetail && <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]"><section className="border border-[var(--border-secondary)] p-4"><h2 className="text-sm">Shipment details</h2><ShipmentForm form={form} onChange={updateForm} onSave={saveShipment} saving={saving} /></section><aside className="border border-[var(--border-secondary)] p-4 text-xs"><p className="text-[var(--text-muted)]">Current status</p><p className="mt-2 uppercase">{shipment?.currentStatus}</p><p className="mt-6 text-[var(--text-muted)]">Shipment ID</p><p className="mt-2 break-all text-[var(--cyan-primary)]">{shipment?.id}</p></aside></section>}

        {!isDetail && <section className="mt-6 border border-[var(--border-secondary)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm">CSV import</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Preview and confirm organization-scoped shipment rows.</p></div><label className="cursor-pointer border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)]"><FileUp className="mr-1 inline h-3.5 w-3.5" />Select CSV<input className="hidden" type="file" accept=".csv,text/csv" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setCsv({ fileName: file.name, text: await file.text() }); setPreview(null); setMapping({}); }} /></label></div>
          {csv && <div className="mt-4"><p className="text-xs text-[var(--text-secondary)]">{csv.fileName}</p><button className="mt-3 border border-[var(--cyan-primary)] px-3 py-2 text-xs text-[var(--cyan-primary)] disabled:opacity-50" disabled={importing} onClick={() => void previewCsv()}><Upload className="mr-1 inline h-3.5 w-3.5" />{importing ? 'Preparing' : 'Preview import'}</button></div>}
          {preview && <div className="mt-5 border-t border-[var(--border-secondary)] pt-4"><div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4"><Metric label="Rows" value={preview.totalRows} /><Metric label="Valid" value={preview.validRows} /><Metric label="Invalid" value={preview.invalidRows} /><Metric label="Duplicates" value={preview.duplicateRows} /></div><div className="mt-5 grid gap-2 md:grid-cols-2">{SHIPMENT_IMPORT_FIELDS.map((field) => <label key={field} className="flex items-center justify-between gap-3 text-xs"><span>{labels[field]}</span><select className="min-w-0 bg-[var(--bg-tertiary)] px-2 py-1" value={mapping[field] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value || undefined }))}><option value="">Not mapped</option>{preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><button className="mt-4 border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)]" onClick={() => void previewCsv(mapping)}>Refresh preview</button>{rowErrors.length > 0 && <ul className="mt-4 space-y-1 text-xs text-[var(--alert-red)]">{rowErrors.map((row) => <li key={row.rowNumber}>Row {row.rowNumber}: {row.errors.join(' ')}</li>)}</ul>}<button className="mt-4 bg-[var(--cyan-primary)] px-3 py-2 text-xs text-black disabled:opacity-50" disabled={importing || preview.validRows === 0} onClick={() => void confirmImport()}><Save className="mr-1 inline h-3.5 w-3.5" />Confirm valid rows</button></div>}
        </section>}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="border border-[var(--border-secondary)] p-3"><p className="text-[10px] uppercase text-[var(--text-muted)]">{label}</p><p className="mt-1 text-lg">{value}</p></div>;
}

function ShipmentForm({ form, onChange, onSave, saving }: { form: ShipmentInput; onChange: (field: keyof ShipmentInput, value: string | number) => void; onSave: () => void; saving: boolean }) {
  const fields: Array<{ field: keyof ShipmentInput; label: string; type?: string }> = [
    { field: 'shipmentReference', label: 'Shipment reference' }, { field: 'carrier', label: 'Carrier' }, { field: 'vesselName', label: 'Vessel' }, { field: 'imoNumber', label: 'IMO' },
    { field: 'originPortName', label: 'Origin port' }, { field: 'destinationPortName', label: 'Destination port' }, { field: 'plannedDepartureAt', label: 'Planned departure', type: 'datetime-local' }, { field: 'plannedArrivalAt', label: 'Planned arrival', type: 'datetime-local' },
  ];
  return <div className="mt-4 grid gap-3 md:grid-cols-2">{fields.map(({ field, label, type = 'text' }) => <label key={field} className="text-xs text-[var(--text-muted)]">{label}<input className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-2 py-2 text-[var(--text-primary)]" type={type} value={String(form[field] ?? '')} onChange={(event) => onChange(field, event.target.value)} /></label>)}<label className="text-xs text-[var(--text-muted)]">Priority<select className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-2 py-2 text-[var(--text-primary)]" value={form.priority ?? 3} onChange={(event) => onChange('priority', Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-xs text-[var(--text-muted)]">Status<select className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-2 py-2 text-[var(--text-primary)]" value={form.currentStatus ?? 'planned'} onChange={(event) => onChange('currentStatus', event.target.value)}>{['planned', 'booked', 'in_transit', 'at_port', 'delivered', 'cancelled'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><button className="bg-[var(--cyan-primary)] px-3 py-2 text-xs text-black disabled:opacity-50 md:col-span-2" disabled={saving} onClick={onSave}><Save className="mr-1 inline h-3.5 w-3.5" />{saving ? 'Saving' : 'Save shipment'}</button></div>;
}
