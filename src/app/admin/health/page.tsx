import HealthDashboard from '@/components/platform/HealthDashboard';
import PlatformShell from '@/components/platform/PlatformShell';
import IntegrationHealthPanel from '@/components/platform/IntegrationHealthPanel';

export default function HealthPage() { return <PlatformShell title="Platform health"><HealthDashboard /><IntegrationHealthPanel /></PlatformShell>; }
