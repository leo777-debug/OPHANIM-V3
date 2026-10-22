import PlatformShell from '@/components/platform/PlatformShell';
import JobFileDetail from '@/components/jobfile/JobFileDetail';
export default async function JobFilePage({ params }: { params: Promise<{ id: string }> }) { return <PlatformShell title="Job file"><div className="platform-content"><JobFileDetail id={(await params).id} /></div></PlatformShell>; }
