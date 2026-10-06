'use client';

import Link from 'next/link';
import { Check, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import ImportMapper from './ImportMapper';

export default function Onboarding() {
  const [message, setMessage] = useState('');
  const seedDemo = async () => { try { const response = await fetch('/api/platform/demo/seed', { method: 'POST' }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Demo setup failed.'); setMessage('Demo scenario created. Open Command to inspect the first correlation and case.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Demo setup failed.'); } };
  return <div className="platform-content"><section className="platform-section"><div className="platform-section__heading"><div><p>First-use sequence</p><h2>Configure your workspace</h2></div></div><ol className="platform-onboarding">{[['Organization configuration', 'Set capabilities, terminology, navigation, and provider choices.', '/admin/verticals'], ['Import private entities', 'Map a customer CSV to generic entities and identifiers.', '#import'], ['Verify the first signal', 'Create an event, inspect deterministic correlations, and keep evidence.', '/events'], ['Open a case', 'Assign tasks and track the outcome in the generic workflow.', '/cases']].map(([title, detail, href], index) => <li key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{detail}</p></div>{href === '#import' ? <a href="#import">Continue</a> : <Link href={href}><Check size={15} /> Continue</Link>}</li>)}</ol><div className="platform-demo-action"><div><strong>Development demo</strong><p>Seeds a clearly marked fictional entity, event, correlation, case, and evidence record for this organization only.</p></div><button type="button" onClick={() => void seedDemo()}><PlayCircle size={16} /> Seed demo</button></div>{message && <p className="platform-notice">{message}</p>}</section><div id="import"><ImportMapper /></div></div>;
}
