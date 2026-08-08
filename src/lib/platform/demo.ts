import { db } from '@/lib/db/pool';
import type { OrganizationActor } from '@/lib/operations/types';
import { updateOrganizationConfiguration } from './capabilities';
import { correlateEvent } from './correlation';
import { createEntity } from './entities';
import { createEvidence } from './evidence';
import { createEvent } from './events';
import { createCase } from './workflows';

const SCENARIO_KEY = 'port-weather-disruption';

export async function seedDemoScenario(actor: OrganizationActor) {
  await updateOrganizationConfiguration(actor, { demoModeEnabled: true });
  const scenario = await db().query<{ id: string }>(`insert into ophanim_demo_scenarios(scenario_key,name,description,payload) values($1,$2,$3,$4) on conflict(scenario_key) do update set name=excluded.name returning id`, [SCENARIO_KEY, 'Port weather disruption', 'Clearly marked development data for workflow and correlation testing.', JSON.stringify({ version: 1 })]);
  await db().query(`insert into ophanim_demo_organizations(organization_id,scenario_id) values($1,$2) on conflict(organization_id) do update set scenario_id=excluded.scenario_id,reset_at=now()`, [actor.organizationId, scenario.rows[0].id]);
  const port = await createEntity(actor, { entityType: 'port', canonicalName: 'Demo Harbor Terminal', identifiers: [{ namespace: 'unlocode', value: 'DMBHR' }], attributes: { country: 'Demo Region' }, metadata: { demo: true } });
  const event = await createEvent(actor, { eventType: 'severe_weather', category: 'weather', title: 'Demo Harbor Terminal storm warning', description: 'Demo Data: a weather advisory names DMBHR and Demo Harbor Terminal.', severity: 72, confidence: 85, latitude: 51.95, longitude: 4.14, relatedEntityIds: [port.id], metadata: { demo: true } });
  const correlations = await correlateEvent(actor, event.id);
  const caseRecord = await createCase(actor, { title: 'Demo: assess terminal weather impact', description: 'Demo Data: review the deterministic correlation and document the outcome.', priority: 'high', entityIds: [port.id], eventIds: [event.id] });
  const evidence = await createEvidence(actor, { evidenceType: 'source_record', verificationState: 'source_record', title: 'Demo weather advisory', description: 'Demo Data only. This is not a live operational notification.', links: [{ resourceType: 'event', resourceId: event.id }, { resourceType: 'case', resourceId: caseRecord!.id }], metadata: { demo: true } });
  return { scenario: SCENARIO_KEY, entity: port, event, correlations, case: caseRecord, evidence };
}

export async function resetDemoScenario(actor: OrganizationActor) {
  const marker = await db().query(`select 1 from ophanim_demo_organizations where organization_id=$1`, [actor.organizationId]);
  if (!marker.rowCount) throw new Error('This organization does not have seeded demo data.');
  const client = await db().connect();
  try {
    await client.query('begin');
    await client.query(`delete from ophanim_evidence where organization_id=$1 and metadata->>'demo'='true'`, [actor.organizationId]);
    await client.query(`delete from ophanim_cases where organization_id=$1 and title like 'Demo:%'`, [actor.organizationId]);
    await client.query(`delete from ophanim_events where organization_id=$1 and metadata->>'demo'='true'`, [actor.organizationId]);
    await client.query(`delete from ophanim_entities where organization_id=$1 and metadata->>'demo'='true'`, [actor.organizationId]);
    await client.query(`update ophanim_demo_organizations set reset_at=now() where organization_id=$1`, [actor.organizationId]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
  return seedDemoScenario(actor);
}
