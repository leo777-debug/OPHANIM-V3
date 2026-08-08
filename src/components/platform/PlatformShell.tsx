'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Boxes, FileText, LayoutDashboard, Map, Search, Settings, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

type Configuration = { navigation: Array<{ id: string; label: string; href: string; capability?: string }>; capabilities: Record<string, boolean>; terminology: Record<string, string> };
const icons: Record<string, typeof LayoutDashboard> = { command: LayoutDashboard, search: Search, map: Map, entities: Boxes, cases: Activity, evidence: FileText, settings: Settings };

export default function PlatformShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();
  const [configuration, setConfiguration] = useState<Configuration | null>(null);

  useEffect(() => {
    void fetch('/api/platform/configuration', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => setConfiguration(body?.configuration ?? null))
      .catch(() => setConfiguration(null));
  }, []);

  const navigation = configuration?.navigation ?? [
    { id: 'command', label: 'Command', href: '/command' }, { id: 'map', label: 'Map', href: '/' }, { id: 'entities', label: 'Entities', href: '/entities' }, { id: 'cases', label: 'Cases', href: '/cases' }, { id: 'evidence', label: 'Evidence', href: '/evidence' },
  ];

  return <main className="platform-shell">
    <aside className="platform-nav" aria-label="Platform navigation">
      <Link href="/" className="platform-brand"><span className="platform-brand__mark"><ShieldCheck size={18} /></span><span>OPHANIM</span></Link>
      <p className="platform-nav__label">Workspace</p>
      <nav>{navigation.filter((item) => !item.capability || configuration?.capabilities[item.capability] !== false).map((item) => {
        const Icon = icons[item.id] ?? Boxes;
        const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
        return <Link key={item.id} href={item.href} className={`platform-nav__item${active ? ' is-active' : ''}`}><Icon size={17} /><span>{configuration?.terminology[item.id] ?? item.label}</span></Link>;
      })}</nav>
      <Link href="/admin/health" className="platform-nav__health"><span />Platform health</Link>
    </aside>
    <section className="platform-main"><header className="platform-header"><div><p>Configured operational workspace</p><h1>{title}</h1></div><div className="platform-header__actions"><Link href="/onboarding">Configure workspace</Link><Link href="/">Open map</Link></div></header>{children}</section>
  </main>;
}
