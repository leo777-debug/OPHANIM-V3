'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [setup, setSetup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true); setError('');
    try {
      const response = await fetch(setup ? '/api/auth/bootstrap' : '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(setup ? { token, email, password, organizationName, organizationSlug } : { email, password, organizationSlug }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Sign-in failed.');
      router.push('/logistics');
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Sign-in failed.'); }
    finally { setSaving(false); }
  };
  return <main className="min-h-screen bg-[var(--bg-void)] p-4 text-[var(--text-primary)] grid place-items-center font-mono"><section className="w-full max-w-sm border border-[var(--border-secondary)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--cyan-primary)]">Ophanim Operations</p><h1 className="mt-2 text-2xl">{setup ? 'Initial setup' : 'Sign in'}</h1>{error && <p className="mt-3 text-xs text-[var(--alert-red)]">{error}</p>}<div className="mt-5 grid gap-3"><label className="text-xs text-[var(--text-muted)]">Organization slug<input value={organizationSlug} onChange={(event) => setOrganizationSlug(event.target.value)} className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-2 text-[var(--text-primary)]" /></label>{setup && <><label className="text-xs text-[var(--text-muted)]">Organization name<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-2 text-[var(--text-primary)]" /></label><label className="text-xs text-[var(--text-muted)]">Bootstrap token<input value={token} onChange={(event) => setToken(event.target.value)} type="password" className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-2 text-[var(--text-primary)]" /></label></>}<label className="text-xs text-[var(--text-muted)]">Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-2 text-[var(--text-primary)]" /></label><label className="text-xs text-[var(--text-muted)]">Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" className="mt-1 w-full border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-2 text-[var(--text-primary)]" /></label><button onClick={() => void submit()} disabled={saving} className="mt-2 bg-[var(--cyan-primary)] p-2 text-xs text-black disabled:opacity-50">{saving ? 'Working' : setup ? 'Create organization' : 'Sign in'}</button><button onClick={() => setSetup((value) => !value)} className="text-xs text-[var(--cyan-primary)]">{setup ? 'Use existing account' : 'Initial organization setup'}</button></div></section></main>;
}
