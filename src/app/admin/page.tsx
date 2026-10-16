import Link from 'next/link';
import { presentationPageOwner } from '@/lib/presentation/page-access';
export const dynamic='force-dynamic';
export default async function AdminPage() {
  if (!await presentationPageOwner()) return <main><h1>Owner access required</h1></main>;
  return <main style={{padding:40}}><h1>Ophanim Admin</h1><p><Link href="/admin/presentation">Presentation mode</Link></p><p><Link href="/admin/health">Provider health</Link></p><p><Link href="/operations">Back to platform</Link></p></main>;
}
