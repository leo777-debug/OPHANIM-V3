import { presentationPageOwner } from '@/lib/presentation/page-access';
import { presentationSettingsOrOff } from '@/lib/presentation/settings';
import PresentationMap from '@/components/presentation/PresentationMap';
export const dynamic = 'force-dynamic';
export default async function PreviewPage() {
  const actor = await presentationPageOwner();
  if (!actor) return <main><h1>Owner access required</h1></main>;
  return <PresentationMap settings={await presentationSettingsOrOff()} preview />;
}
