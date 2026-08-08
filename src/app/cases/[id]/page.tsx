import CaseDetail from '@/components/platform/CaseDetail';
import PlatformShell from '@/components/platform/PlatformShell';

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) { return <PlatformShell title="Case"><CaseDetail id={(await params).id} /></PlatformShell>; }
