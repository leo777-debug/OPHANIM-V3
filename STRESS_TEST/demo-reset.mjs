import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedApp } from './harness.mjs';

await withIsolatedApp(async ({ base, root }) => {
  const demo = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), 'utf8'));
  const headers = { Cookie: `ophanim_session=${demo.token}`, Origin: base, 'Content-Type': 'application/json' };
  const shipmentResponse = await fetch(`${base}/api/logistics/shipments`, { method: 'POST', headers, body: JSON.stringify({
    shipmentReference: 'DXB-291', originPortName: 'Jebel Ali', destinationPortName: 'Nhava Sheva', originPortCode: 'AEJEA', destinationPortCode: 'INNSA', plannedArrivalAt: '2026-10-16T12:00:00Z',
  }) });
  if (shipmentResponse.status !== 201) throw new Error('Synthetic demo shipment seed failed.');
  const shipment = (await shipmentResponse.json()).shipment;
  if (shipment.originPortName !== 'Jebel Ali' || shipment.destinationPortName !== 'Nhava Sheva') throw new Error('Demo port names were not persisted.');
  const disruptionResponse = await fetch(`${base}/api/logistics/disruptions`, { method: 'POST', headers, body: JSON.stringify({
    source: 'synthetic_demo', sourceReference: 'demo-reset-weather', disruptionType: 'weather', severity: 5,
    title: 'DEMO ONLY - severe weather at Nhava Sheva', description: 'Synthetic replay for presentation. Port match only; not a validated forecast-cone or ETA-overlap calculation.',
    affectedPorts: ['INNSA'], effectiveAt: '2026-10-16T00:00:00Z', reportedAt: '2026-10-13T08:00:00Z',
  }) });
  if (!disruptionResponse.ok) throw new Error('Synthetic demo disruption seed failed.');
  const disruption = (await disruptionResponse.json()).disruption;
  const reconciled = await fetch(`${base}/api/logistics/disruptions/${disruption.id}/reconcile`, { method: 'POST', headers, body: '{}' });
  const result = await reconciled.json();
  if (!reconciled.ok || !result.assessments?.some((item) => item.shipmentId === shipment.id)) throw new Error('The real matcher did not connect the synthetic demo shipment.');
  const rescueResponse = await fetch(`${base}/api/logistics/rescue-cases`, { method: 'POST', headers, body: JSON.stringify({ shipmentId: shipment.id, disruptionId: disruption.id, objective: 'DEMO ONLY - review carrier options before changing bookings.' }) });
  if (rescueResponse.status !== 201) throw new Error('Demo rescue workflow could not be stored.');
  const rescue = (await rescueResponse.json()).rescueCase;
  const decision = await fetch(`${base}/api/logistics/rescue-cases/${rescue.id}/decisions`, { method: 'POST', headers, body: JSON.stringify({ decision: 'note', rationale: 'DEMO ONLY: ask the carrier for alternate sailings before changing bookings.' }) });
  if (decision.status !== 201) throw new Error('Demo operator decision was not persisted.');
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: demo.email, password: demo.password, organizationSlug: 'competition-demo' }) });
  if (!login.ok) throw new Error('Synthetic presentation login is unavailable.');
  await writeFile(resolve(root, 'STRESS_TEST/artifacts/demo-reset.json'), JSON.stringify({ checkedAt: new Date().toISOString(), pass: true, syntheticOnly: true, shipmentCreated: true, portNamesPersisted: true, destinationPortMatched: true, decisionLogged: true, loginWorks: true, limitation: 'Port matching and a stored operator note only; no booking changed, fabricated document discrepancy, GPS or confirmation feature.' }, null, 2));
  console.log(`Synthetic demo ready: ${base}/login. Recorded scenario only, not live intelligence. Local demo login is documented in STRESS_TEST/LOCAL_TESTING.md.`);
  if (!process.argv.includes('--check')) await new Promise((resolve) => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
});
