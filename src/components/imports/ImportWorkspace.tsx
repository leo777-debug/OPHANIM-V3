'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, FileUp, LoaderCircle, RefreshCw, TriangleAlert, Upload } from 'lucide-react';
import type { ImportColumnMapping, ImportPreview, ImportType, PersistedImport } from '@/lib/imports/types';

const importOptions: Array<{ type: ImportType; label: string; description: string; available: boolean }> = [
  { type: 'shipment', label: 'Shipments', description: 'Logistics shipment references and operational data.', available: true },
  { type: 'cyber_client', label: 'Cyber clients', description: 'Managed cybersecurity client records.', available: true },
  { type: 'cyber_asset', label: 'Cyber assets', description: 'Client-scoped inventory records.', available: true },
  { type: 'vendor_dependency', label: 'Vendor dependencies', description: 'Client vendor and service dependencies.', available: true },
];

const shipmentFields: Array<{ key: string; label: string }> = [
  ['shipmentReference', 'Shipment reference'], ['bookingNumber', 'Booking number'], ['containerNumber', 'Container number'],
  ['billOfLadingReference', 'Bill of lading'], ['carrier', 'Carrier'], ['vesselName', 'Vessel name'], ['imoNumber', 'IMO number'], ['mmsiNumber', 'MMSI number'],
  ['originPortName', 'Origin port'], ['originPortCode', 'Origin port code'], ['destinationPortName', 'Destination port'],
  ['destinationPortCode', 'Destination port code'], ['transshipmentPorts', 'Transshipment ports'], ['customerId', 'Customer ID'], ['customerContact', 'Customer contact'], ['operationalTimezone', 'Operational timezone'], ['plannedDepartureAt', 'Planned departure'],
  ['plannedArrivalAt', 'Planned arrival'], ['actualDepartureAt', 'Actual departure'], ['actualArrivalAt', 'Actual arrival'],
  ['cargoType', 'Cargo type'], ['priority', 'Priority'], ['currentStatus', 'Current status'],
].map(([key, label]) => ({ key, label }));

const cyberClientFields = [
  ['name', 'Client name'], ['reference', 'Client identifier'], ['timezone', 'Timezone'], ['securityContact', 'Security contact'], ['executiveContact', 'Executive contact'], ['escalationContact', 'Escalation contact'], ['serviceTier', 'Service tier'], ['responseSlaHours', 'Response SLA hours'], ['remediationSlaHours', 'Remediation SLA hours'], ['tags', 'Tags'],
].map(([key, label]) => ({ key, label }));
const cyberAssetFields = [
  ['clientIdentifier', 'Client identifier'], ['assetName', 'Asset name'], ['assetType', 'Asset type'], ['hostname', 'Hostname'], ['domain', 'Domain'], ['ipAddress', 'IP address'], ['exposureScope', 'Exposure scope'], ['internetFacing', 'Internet facing'], ['vendor', 'Vendor'], ['product', 'Product'], ['productVersion', 'Product version'], ['operatingSystem', 'Operating system'], ['softwarePackage', 'Software package'], ['cloudProvider', 'Cloud provider'], ['cloudAccount', 'Cloud account'], ['cloudRegion', 'Cloud region'], ['environment', 'Environment'], ['criticality', 'Criticality'], ['assetOwner', 'Asset owner'], ['inventorySource', 'Inventory source'], ['inventoryConfidence', 'Inventory confidence'], ['lastObservedAt', 'Last observed'], ['lastVerifiedAt', 'Last verified'], ['verificationStatus', 'Verification status'],
].map(([key, label]) => ({ key, label }));
const dependencyFields = [
  ['clientIdentifier', 'Client identifier'], ['vendor', 'Vendor'], ['productOrService', 'Product or service'], ['dependencyType', 'Dependency type'], ['businessCriticality', 'Business criticality'], ['internalOwner', 'Internal owner'], ['securityContact', 'Security contact'], ['verificationStatus', 'Verification status'], ['lastVerifiedAt', 'Last verified'],
].map(([key, label]) => ({ key, label }));
const importFields: Record<ImportType, Array<{ key: string; label: string }>> = { shipment: shipmentFields, cyber_client: cyberClientFields, cyber_asset: cyberAssetFields, vendor_dependency: dependencyFields };

interface PreviewResponse {
  import: PersistedImport;
  preview: ImportPreview;
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'The import request failed.');
  return payload;
}

function statusText(status: PersistedImport['status']): string {
  return status.replaceAll('_', ' ');
}

export default function ImportWorkspace() {
  const [importType, setImportType] = useState<ImportType>('shipment');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [imported, setImported] = useState<PersistedImport | null>(null);
  const [mapping, setMapping] = useState<ImportColumnMapping>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const visibleFields = importFields[importType];
  const invalidRows = useMemo(() => preview?.rows.filter((row) => row.status !== 'valid').slice(0, 12) ?? [], [preview]);
  const isQueued = imported?.status === 'queued' || imported?.status === 'running';

  const refreshImport = async (id: string) => {
    const response = await fetch(`/api/imports/${id}`, { cache: 'no-store' });
    const payload = await responseJson<{ import: PersistedImport }>(response);
    setImported(payload.import);
  };

  useEffect(() => {
    if (!isQueued || !imported) return undefined;
    const timer = window.setInterval(() => { void refreshImport(imported.id).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to refresh import progress.')); }, 3_000);
    return () => window.clearInterval(timer);
  }, [imported, isQueued]);

  const requestPreview = async (nextMapping = mapping) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const body = new FormData();
      body.set('importType', importType);
      body.set('file', file);
      if (Object.keys(nextMapping).length) body.set('mapping', JSON.stringify(nextMapping));
      const response = await fetch('/api/imports/preview', { method: 'POST', body });
      const payload = await responseJson<PreviewResponse>(response);
      setPreview(payload.preview); setImported(payload.import); setMapping(payload.preview.mapping);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to preview the import.'); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!imported) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/imports/${imported.id}/confirm`, { method: 'POST' });
      const payload = await responseJson<{ import: PersistedImport }>(response);
      setImported(payload.import);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to confirm the import.'); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-[var(--bg-void)] px-5 py-8 text-[var(--text-primary)] md:px-10">
    <div className="mx-auto max-w-6xl">
      <header className="border-b border-[var(--border-secondary)] pb-5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--cyan-primary)]">Organization data</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-2xl font-semibold">CSV import</h1><p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">Validate, map, and import tenant-scoped operational data without exposing it to another organization.</p></div>
          {imported && <div className="text-right text-xs"><p className="uppercase text-[var(--text-muted)]">Import status</p><p className="mt-1 font-medium uppercase text-[var(--cyan-primary)]">{statusText(imported.status)}</p></div>}
        </div>
      </header>

      <section className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-4">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--text-muted)]">Data type</p>
          <div className="mt-3 grid gap-2">{importOptions.map((option) => <button key={option.type} type="button" disabled={!option.available || busy} onClick={() => { setImportType(option.type); setPreview(null); setImported(null); setMapping({}); setError(''); }} className={`border p-3 text-left transition ${importType === option.type ? 'border-[var(--cyan-primary)] bg-[var(--bg-tertiary)]' : 'border-[var(--border-secondary)]'} ${!option.available ? 'cursor-not-allowed opacity-45' : 'hover:border-[var(--cyan-primary)]'}`}><span className="block text-sm font-medium">{option.label}</span><span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{option.description}</span></button>)}</div>
        </aside>

        <section className="border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-secondary)] pb-4">
            <div><h2 className="text-base font-medium">1. Select a UTF-8 CSV</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Maximum 5 MB and 5,000 rows. Formulas are rejected before import.</p></div>
            <div className="flex items-center gap-2"><a className="border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)]" href={`/api/imports/template/${importType}`}><Download className="mr-1 inline h-3.5 w-3.5" />Template</a><label className="cursor-pointer border border-[var(--cyan-primary)] px-3 py-2 text-xs text-[var(--cyan-primary)] hover:bg-[var(--bg-tertiary)]"><FileUp className="mr-1 inline h-3.5 w-3.5" />Select CSV<input className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); setPreview(null); setImported(null); setMapping({}); setError(''); }} /></label></div>
          </div>
          {file && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{file.name} <span className="ml-2 text-xs text-[var(--text-muted)]">{Math.ceil(file.size / 1024)} KB</span></p><button type="button" disabled={busy} onClick={() => void requestPreview()} className="border border-[var(--cyan-primary)] px-3 py-2 text-xs text-[var(--cyan-primary)] disabled:opacity-50"><Upload className="mr-1 inline h-3.5 w-3.5" />{busy ? 'Preparing' : 'Preview import'}</button></div>}

          {error && <p role="alert" className="mt-4 flex gap-2 border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200"><TriangleAlert className="h-4 w-4 shrink-0" />{error}</p>}

          {preview && <div className="mt-6 border-t border-[var(--border-secondary)] pt-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Rows" value={preview.totalRows} /><Metric label="Valid" value={preview.validRows} /><Metric label="Invalid" value={preview.invalidRows} /><Metric label="Duplicates" value={preview.duplicateRows} /></div>
            <div className="mt-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-medium">2. Confirm column mapping</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Detected mappings can be adjusted before confirmation.</p></div><button type="button" disabled={busy} onClick={() => void requestPreview(mapping)} className="border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)] disabled:opacity-50"><RefreshCw className="mr-1 inline h-3.5 w-3.5" />Refresh preview</button></div>
              <div className="mt-4 grid gap-x-5 gap-y-2 md:grid-cols-2">{visibleFields.map((field) => <label key={field.key} className="flex items-center justify-between gap-3 text-xs"><span>{field.label}</span><select className="min-w-0 bg-[var(--bg-tertiary)] px-2 py-1.5 text-[var(--text-primary)]" value={mapping[field.key] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value || undefined }))}><option value="">Not mapped</option>{preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>
            </div>

            <div className="mt-6 border-t border-[var(--border-secondary)] pt-5"><h2 className="text-base font-medium">3. Review and import</h2>
              {invalidRows.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="text-[var(--text-muted)]"><tr><th className="pb-2">Row</th><th className="pb-2">Status</th><th className="pb-2">Validation details</th></tr></thead><tbody>{invalidRows.map((row) => <tr key={row.rowNumber} className="border-t border-[var(--border-secondary)]"><td className="py-2">{row.rowNumber}</td><td className="py-2 uppercase">{row.status.replaceAll('_', ' ')}</td><td className="py-2 text-red-200">{row.errors.join(' ')}</td></tr>)}</tbody></table></div>}
              <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" disabled={busy || imported?.status !== 'previewed'} onClick={() => void confirm()} className="border border-[var(--cyan-primary)] bg-[var(--cyan-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-void)] disabled:opacity-50"><CheckCircle2 className="mr-1 inline h-4 w-4" />{busy ? 'Importing' : 'Confirm import'}</button>{imported && <a href={`/api/imports/${imported.id}/error-report`} className="border border-[var(--border-secondary)] px-3 py-2 text-xs hover:border-[var(--cyan-primary)]"><Download className="mr-1 inline h-3.5 w-3.5" />Download error report</a>}{isQueued && <span className="text-xs text-[var(--text-muted)]"><LoaderCircle className="mr-1 inline h-3.5 w-3.5 animate-spin" />{imported.processedRows} of {imported.totalRows} rows processed</span>}{imported?.status === 'completed' && <span className="text-xs text-[var(--cyan-primary)]">{imported.importedRows} imported, {imported.failedRows} not imported</span>}</div>
            </div>
          </div>}
        </section>
      </section>
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="border border-[var(--border-secondary)] px-3 py-2"><p className="text-xs uppercase text-[var(--text-muted)]">{label}</p><p className="mt-1 text-lg font-medium">{value}</p></div>;
}
