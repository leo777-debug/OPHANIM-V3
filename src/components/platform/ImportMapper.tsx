'use client';

import { FileUp, Play } from 'lucide-react';
import { FormEvent, useState } from 'react';

export default function ImportMapper() {
  const [file, setFile] = useState<File | null>(null);
  const [entityType, setEntityType] = useState('asset');
  const [canonicalName, setCanonicalName] = useState('Name');
  const [message, setMessage] = useState('');
  const [importId, setImportId] = useState('');
  const preview = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return setMessage('Choose a CSV file first.');
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('entityType', entityType);
      form.set('mapping', JSON.stringify({ canonicalName }));
      const response = await fetch('/api/platform/imports/preview', { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Unable to preview import.');
      setImportId(body.import.id);
      setMessage(`${body.import.preview.validRows} valid rows ready for confirmation.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to preview import.'); }
  };
  const confirm = async () => {
    try {
      const response = await fetch(`/api/platform/imports/${importId}/confirm`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Unable to confirm import.');
      setMessage('Import queued. The import worker will create valid entities.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to confirm import.'); }
  };
  return <section className="platform-section"><div className="platform-section__heading"><div><p>Customer data</p><h2>Entity import</h2></div></div><form className="platform-import" onSubmit={(event) => void preview(event)}><label><span>CSV file</span><input type="file" accept=".csv,text/csv,text/plain" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><label><span>Entity type</span><input value={entityType} onChange={(event) => setEntityType(event.target.value)} /></label><label><span>Canonical-name column</span><input value={canonicalName} onChange={(event) => setCanonicalName(event.target.value)} /></label><button type="submit"><FileUp size={16} /> Preview</button>{importId && <button type="button" onClick={() => void confirm()}><Play size={16} /> Confirm</button>}</form>{message && <p className="platform-notice">{message}</p>}</section>;
}
