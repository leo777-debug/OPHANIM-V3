import { redirect } from 'next/navigation';
import { presentationSettingsOrOff } from '@/lib/presentation/settings';
import PresentationMap from '@/components/presentation/PresentationMap';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Live global intelligence', robots: { index: false, follow: false } };
export default async function PresentationPage() {
  const settings = await presentationSettingsOrOff(true);
  if (!settings.enabled) redirect('/');
  return <PresentationMap settings={settings} />;
}
