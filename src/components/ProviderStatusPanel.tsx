'use client';

import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Database, KeyRound, Map, RefreshCw, XCircle } from 'lucide-react';

type ProviderRecord = {
  name: string;
  description: string;
  supportedEntityTypes: string[];
  supportsMapLayers: boolean;
  requiresCredentials: boolean;
  enabled: boolean;
  configured: boolean;
  health: { status: 'unknown' | 'healthy' | 'degraded' | 'circuit_open'; consecutiveFailures: number };
  governance: { attribution: string; licensing: string; retentionHours: number };
};

type ProviderResponse = {
  providers: ProviderRecord[];
  productionSources: Array<{
    id: string;
    name: string;
    scope: string[];
    mode: 'core' | 'supporting' | 'optional' | 'disabled_by_default';
    evidenceTier: string;
    refresh: string;
    configured: boolean;
    purpose: string;
  }>;
  available: number;
  total: number;
  timestamp: string;
};

export default function ProviderStatusPanel() {
  const [state, setState] = useState<ProviderResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/providers', { cache: 'no-store' });
      if (!response.ok) throw new Error('Provider catalog unavailable');
      setState(await response.json());
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    fetch('/api/providers', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Provider catalog unavailable')))
      .then((response: ProviderResponse) => { if (!cancelled) setState(response); })
      .catch(() => { if (!cancelled) setState(null); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  return (
    <section className="overflow-hidden border border-white/10 bg-[#0b1115]/95 shadow-2xl backdrop-blur-xl">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-[var(--cyan-primary)]" />
          <div>
            <h2 className="text-xs font-semibold text-white">Source Network</h2>
            <p className="mt-0.5 text-[10px] text-white/45">Provider registry and map capability</p>
          </div>
        </div>
        <button onClick={() => void load()} className="grid h-8 w-8 place-items-center text-white/60 hover:bg-white/10 hover:text-white" title="Refresh source status">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.025] px-4 py-2.5 text-[10px]">
        <span className="flex items-center gap-1.5 text-white/55"><Activity className="h-3 w-3 text-emerald-400" /> {state ? `${state.available} available` : 'Checking sources'}</span>
        <span className="text-white/35">{state ? `${state.total} registered` : '--'}</span>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {!loading && !state && <div className="px-4 py-7 text-center text-xs text-white/45">Source status is temporarily unavailable.</div>}
        {state?.productionSources.map((source) => {
          const label = source.mode === 'core' ? 'CORE' : source.mode === 'supporting' ? 'SUPPORTING' : source.mode === 'optional' ? 'OPTIONAL' : 'OFF BY DEFAULT';
          const color = source.mode === 'core' ? 'text-emerald-300' : source.mode === 'supporting' ? 'text-cyan-200' : source.mode === 'optional' ? 'text-amber-200' : 'text-white/35';
          return (
            <div key={source.id} className="border-b border-white/[0.07] px-4 py-3 last:border-b-0">
              <div className="flex items-start gap-2">
                {source.configured ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-white/90">{source.name}</span>
                    <span className={`shrink-0 text-[9px] ${color}`}>{label}</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-white/45">{source.purpose}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-white/40">
                    <span>{source.scope.join(' + ')}</span>
                    <span>{source.evidenceTier.replaceAll('_', ' ')}</span>
                    <span>{source.refresh}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {state?.productionSources.length ? <div className="border-b border-white/10 bg-white/[0.025] px-4 py-2 text-[9px] font-medium uppercase tracking-[0.16em] text-white/35">Registered providers</div> : null}
        {state?.providers.map((provider) => {
          const ready = provider.enabled && provider.configured;
          const healthLabel = provider.health.status === 'circuit_open' ? 'PAUSED' : provider.health.status === 'degraded' ? 'DEGRADED' : ready ? 'READY' : provider.enabled ? 'SETUP' : 'OFF';
          return (
            <div key={provider.name} className="border-b border-white/[0.07] px-4 py-3 last:border-b-0">
              <div className="flex items-start gap-2">
                {ready ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-white/90">{provider.name}</span>
                    <span className={`shrink-0 text-[9px] ${healthLabel === 'READY' ? 'text-emerald-300' : healthLabel === 'PAUSED' ? 'text-red-300' : 'text-amber-200'}`}>{healthLabel}</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-white/45">{provider.description}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-white/40">
                    <span>{provider.supportedEntityTypes.join(', ')}</span>
                    {provider.supportsMapLayers && <span className="inline-flex items-center gap-1"><Map className="h-2.5 w-2.5" /> map layer</span>}
                    {provider.requiresCredentials && <span className="inline-flex items-center gap-1"><KeyRound className="h-2.5 w-2.5" /> credentials</span>}
                    <span>retention {provider.governance.retentionHours}h</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
