import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWarSanctionsVessel } from '@/lib/war-sanctions';

export const dynamic = 'force-dynamic';

export default async function WarSanctionsEntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let vessel;
  try {
    vessel = await getWarSanctionsVessel(id);
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[var(--bg-void)] text-[var(--text-primary)] p-6 md:p-10 font-mono">
      <Link href="/" className="text-xs text-[var(--cyan-primary)] hover:text-white">BACK TO OPHANIM</Link>
      <section className="max-w-4xl mt-8 border border-[var(--border-active)] p-6">
        <p className="text-xs uppercase tracking-wider text-[var(--gold-primary)]">{vessel.isShadowFleet ? 'GUR Shadow Fleet' : 'GUR War & Sanctions'}</p>
        <h1 className="mt-3 text-2xl md:text-4xl text-white">{vessel.name}</h1>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 text-sm">
          {[["IMO", vessel.imo], ["MMSI", vessel.mmsi], ["Flag", vessel.flag], ["Vessel type", vessel.vesselType], ["Category", vessel.category]].filter(([, value]) => value).map(([label, value]) => (
            <div key={label} className="border-t border-[var(--border-secondary)] pt-2"><dt className="text-[var(--text-muted)]">{label}</dt><dd className="mt-1">{value}</dd></div>
          ))}
        </dl>
        {vessel.summary && <p className="mt-8 text-sm leading-6 text-[var(--text-secondary)]">{vessel.summary}</p>}
        {vessel.ports.length > 0 && <section className="mt-8"><h2 className="text-sm text-[var(--gold-primary)]">SOURCE-LISTED ASSOCIATED PORTS</h2><ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">{vessel.ports.map((port) => <li key={port.id}>{port.name} <span className="text-[var(--text-muted)]">{port.lat.toFixed(4)}, {port.lng.toFixed(4)}</span></li>)}</ul></section>}
        <a className="inline-block mt-8 text-sm text-[var(--cyan-primary)] hover:text-white" href={vessel.sourceUrl} target="_blank" rel="noreferrer">VIEW OFFICIAL GUR SOURCE</a>
      </section>
    </main>
  );
}
