'use client';
import { useEffect, useState } from 'react';
type Provider = { id: string; name: string; configured: boolean; warning?: string; compliance?: { license: string; commercialUse: string; attribution: string; rateLimits: string; termsUrl: string } };
export default function VerifySourceHealth() {
  const [providers, setProviders] = useState<Provider[]>([]), [error, setError] = useState('');
  useEffect(() => { let active = true; void fetch('/api/verify/providers').then(async (response) => { if (!response.ok) throw new Error('Source permissions unavailable.'); const body = await response.json(); if (active) setProviders(body.providers); }).catch(() => { if (active) setError('Verify source permissions unavailable.'); }); return () => { active = false; }; }, []);
  return <section className="platform-section"><h2>Verify source permissions</h2>{error && <p role="alert">{error}</p>}{providers.map((provider) => <div className="platform-detail__block" key={provider.id}><h3>{provider.name}</h3><p>{provider.warning || (provider.configured ? 'Configured' : 'Not configured')}</p><p>Licence: {provider.compliance?.license}; commercial use: {provider.compliance?.commercialUse}</p><p>{provider.compliance?.attribution}</p><p>{provider.compliance?.rateLimits}</p></div>)}</section>;
}
