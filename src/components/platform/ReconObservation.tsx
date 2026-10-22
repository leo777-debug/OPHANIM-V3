import type { inspectApprovedTarget } from '@/lib/integrations/scanner';
type Observation = Awaited<ReturnType<typeof inspectApprovedTarget>>;
export default function ReconObservation({ observation }: { observation: Observation }) {
  return <section aria-label="Approved HTTPS observation" className="space-y-3 text-xs break-words">
    <h3 className="font-semibold">Approved HTTPS observation</h3>
    <p>{observation.target} · {observation.mode} · HTTP {observation.httpStatus}</p>
    <p>Observed {observation.observedAt} · Risk unknown</p>
    <dl className="space-y-1">
      <dt>TLS verification</dt><dd>{observation.tls.authorized === null ? 'Unknown' : observation.tls.authorized ? 'Certificate verified' : 'Not verified'}</dd>
      <dt>Protocol</dt><dd>{observation.tls.protocol ?? 'Unknown'}</dd>
      <dt>Certificate validity</dt><dd>{observation.tls.validFrom ?? 'Unknown'} — {observation.tls.validTo ?? 'Unknown'}</dd>
    </dl>
    <h4 className="font-semibold">Selected response headers</h4>
    {Object.keys(observation.headers).length ? <dl className="space-y-2">{Object.entries(observation.headers).map(([name, value]) =>
      <div key={name}><dt className="font-mono">{name}</dt><dd className="whitespace-pre-wrap">{value}</dd></div>)}</dl> : <p>No selected headers were present.</p>}
    <p>{observation.attribution}</p>
    <ul className="list-disc pl-4">{observation.limitations.map(value => <li key={value}>{value}</li>)}</ul>
  </section>;
}
