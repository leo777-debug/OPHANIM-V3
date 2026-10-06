export default function DemoBanner({ enabled }: { enabled: boolean }) {
  return enabled ? <p className="platform-demo-banner">Demo Data: this workspace contains fictional development records only.</p> : null;
}
