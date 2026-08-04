import type { ReactNode } from 'react';
import AppShell from '@/components/logistics/AppShell';

export default function LogisticsLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
