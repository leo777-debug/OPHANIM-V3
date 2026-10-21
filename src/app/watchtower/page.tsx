import PlatformShell from '@/components/platform/PlatformShell';
import WatchtowerWorkspace from '@/components/lens/WatchtowerWorkspace';
export default async function WatchtowerPage({ searchParams }: { searchParams: Promise<{ port?: string }> }) {
  const port = (await searchParams).port;
  return <PlatformShell title="Watchtower"><div className="platform-content"><WatchtowerWorkspace initialPort={port && /^[A-Z]{5}$/i.test(port) ? port.toUpperCase() : null} /></div></PlatformShell>;
}
