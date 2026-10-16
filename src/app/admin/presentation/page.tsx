import { presentationPageOwner } from '@/lib/presentation/page-access';
import PresentationAdmin from '@/components/presentation/PresentationAdmin';
export const dynamic='force-dynamic';
export const metadata={title:'Presentation mode settings',robots:{index:false,follow:false}};
export default async function PresentationSettingsPage() {
  if (!await presentationPageOwner()) return <main><h1>Owner access required</h1><p>Use your existing Ophanim owner login to change presentation settings.</p></main>;
  return <PresentationAdmin />;
}
