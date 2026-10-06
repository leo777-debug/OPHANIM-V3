import EventDetail from '@/components/platform/EventDetail';
import PlatformShell from '@/components/platform/PlatformShell';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) { return <PlatformShell title="Event"><EventDetail id={(await params).id} /></PlatformShell>; }
