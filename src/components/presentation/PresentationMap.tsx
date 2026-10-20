'use client';

import { Suspense } from 'react';
import UnifiedMap from '@/components/map/UnifiedMap';
import type { PresentationSettings } from '@/lib/presentation/types';

export default function PresentationMap({ settings }: { settings:PresentationSettings; preview?:boolean }) {
  return <Suspense fallback={<p>Opening operational map...</p>}><UnifiedMap publicSurface settings={settings}/></Suspense>;
}
