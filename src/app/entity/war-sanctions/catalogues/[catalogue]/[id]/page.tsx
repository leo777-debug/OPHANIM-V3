import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWarSanctionsPublicEntity, type WarSanctionsPublicCatalogue } from '@/lib/war-sanctions';

const catalogues = new Set<WarSanctionsPublicCatalogue>([
  'sanctions-persons', 'sanctions-companies', 'component-companies', 'uav-companies', 'rostec',
  'executives', 'scientists', 'kidnappers', 'propaganda', 'sports',
]);

export const dynamic = 'force-dynamic';

export default async function WarSanctionsPublicEntityPage({
  params,
}: {
  params: Promise<{ catalogue: string; id: string }>;
}) {
  const { catalogue, id } = await params;
  if (!catalogues.has(catalogue as WarSanctionsPublicCatalogue)) notFound();

  let entity;
  try {
    entity = await getWarSanctionsPublicEntity(catalogue as WarSanctionsPublicCatalogue, id);
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[var(--bg-void)] text-[var(--text-primary)] p-6 md:p-10 font-mono">
      <Link href="/" className="text-xs text-[var(--cyan-primary)] hover:text-white">BACK TO OPHANIM</Link>
      <section className="max-w-4xl mt-8 border border-[var(--border-active)] p-6">
        <p className="text-xs uppercase tracking-wider text-[var(--gold-primary)]">GUR WAR &amp; SANCTIONS | {entity.entityType}</p>
        <h1 className="mt-3 text-2xl md:text-4xl text-white">{entity.label}</h1>
        {entity.summary && <p className="mt-8 text-sm leading-6 text-[var(--text-secondary)]">{entity.summary}</p>}
        <a className="inline-block mt-8 text-sm text-[var(--cyan-primary)] hover:text-white" href={entity.sourceUrl} target="_blank" rel="noreferrer">VIEW OFFICIAL GUR SOURCE</a>
      </section>
    </main>
  );
}
