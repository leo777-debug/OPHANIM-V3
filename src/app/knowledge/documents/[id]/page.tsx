import PlatformShell from '@/components/platform/PlatformShell';
import SourcePreview from '@/components/knowledge/SourcePreview';
export default async function SourcePage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PlatformShell title="Knowledge source"><SourcePreview id={id}/></PlatformShell>;}
