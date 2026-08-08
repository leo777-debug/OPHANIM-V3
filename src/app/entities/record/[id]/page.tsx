import PlatformShell from '@/components/platform/PlatformShell';
import EntityDetail from '@/components/platform/EntityDetail';

export default async function EntityRecordPage({ params }: { params: Promise<{ id: string }> }) {
  return <PlatformShell title="Entity record"><EntityDetail id={(await params).id} /></PlatformShell>;
}
