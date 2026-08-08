import { db } from '@/lib/db/pool';
import type { OrganizationActor } from '@/lib/operations/types';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import type { OrganizationConfiguration } from './types';
import { object, text } from './validation';

const DEFAULT_CONFIGURATION: OrganizationConfiguration = {
  vertical: 'general',
  capabilities: { map: true, search: true, workflows: true, entities: true, events: true, evidence: true, watchlists: true },
  enabledProviderIds: [],
  navigation: [
    { id: 'command', label: 'Command', href: '/command', capability: 'workflows' },
    { id: 'search', label: 'Search', href: '/?panel=search', capability: 'search' },
    { id: 'map', label: 'Map', href: '/', capability: 'map' },
    { id: 'entities', label: 'Entities', href: '/entities', capability: 'entities' },
    { id: 'cases', label: 'Cases', href: '/cases', capability: 'workflows' },
    { id: 'evidence', label: 'Evidence', href: '/evidence', capability: 'evidence' },
    { id: 'watchlists', label: 'Watchlists', href: '/?panel=watchlists', capability: 'watchlists' },
  ],
  terminology: {},
  dashboard: {},
  analyticsEnabled: true,
  demoModeEnabled: false,
};

type ConfigurationRow = {
  vertical: string; capabilities: Record<string, boolean>; enabled_provider_ids: string[]; navigation: OrganizationConfiguration['navigation']; terminology: Record<string, string>; dashboard: Record<string, unknown>; analytics_enabled: boolean; demo_mode_enabled: boolean;
};

function record(row: ConfigurationRow): OrganizationConfiguration {
  return { vertical: row.vertical, capabilities: { ...DEFAULT_CONFIGURATION.capabilities, ...(row.capabilities ?? {}) }, enabledProviderIds: row.enabled_provider_ids ?? [], navigation: row.navigation?.length ? row.navigation : DEFAULT_CONFIGURATION.navigation, terminology: row.terminology ?? {}, dashboard: row.dashboard ?? {}, analyticsEnabled: row.analytics_enabled, demoModeEnabled: row.demo_mode_enabled };
}

export async function getOrganizationConfiguration(actor: OrganizationActor): Promise<OrganizationConfiguration> {
  await db().query(`insert into ophanim_organization_configuration(organization_id) values($1) on conflict do nothing`, [actor.organizationId]);
  const result = await db().query<ConfigurationRow>(`select vertical,capabilities,enabled_provider_ids,navigation,terminology,dashboard,analytics_enabled,demo_mode_enabled from ophanim_organization_configuration where organization_id=$1`, [actor.organizationId]);
  return result.rows[0] ? record(result.rows[0]) : DEFAULT_CONFIGURATION;
}

export function capabilityEnabled(configuration: OrganizationConfiguration, capability: string): boolean {
  return configuration.capabilities[capability] !== false;
}

export async function requirePlatformCapability(actor: OrganizationActor, capability: string): Promise<OrganizationConfiguration> {
  const configuration = await getOrganizationConfiguration(actor);
  if (!capabilityEnabled(configuration, capability)) throw new OrganizationAccessError(`The ${capability} capability is disabled for this organization.`);
  return configuration;
}

export async function updateOrganizationConfiguration(actor: OrganizationActor, value: unknown): Promise<OrganizationConfiguration> {
  const input = object(value, 'Organization configuration');
  const current = await getOrganizationConfiguration(actor);
  const capabilities = input.capabilities === undefined ? current.capabilities : Object.fromEntries(Object.entries(object(input.capabilities, 'Capabilities')).map(([name, enabled]) => [text(name, 'Capability', 80)!, Boolean(enabled)]));
  const enabledProviderIds = input.enabledProviderIds === undefined ? current.enabledProviderIds : Array.isArray(input.enabledProviderIds) ? input.enabledProviderIds.filter((id): id is string => typeof id === 'string' && /^[a-z0-9_-]{2,120}$/i.test(id)).slice(0, 100) : (() => { throw new Error('Enabled provider IDs must be an array.'); })();
  const navigation = input.navigation === undefined ? current.navigation : Array.isArray(input.navigation) ? input.navigation.slice(0, 30).map((item) => {
    const entry = object(item, 'Navigation item');
    const href = text(entry.href, 'Navigation href', 500)!;
    if (!href.startsWith('/')) throw new Error('Navigation href must be an internal path.');
    return { id: text(entry.id, 'Navigation ID', 80)!, label: text(entry.label, 'Navigation label', 120)!, href, ...(entry.capability ? { capability: text(entry.capability, 'Navigation capability', 80)! } : {}) };
  }) : (() => { throw new Error('Navigation must be an array.'); })();
  const terminology = input.terminology === undefined ? current.terminology : Object.fromEntries(Object.entries(object(input.terminology, 'Terminology')).map(([name, label]) => [text(name, 'Terminology key', 80)!, text(label, 'Terminology label', 120)!]));
  const dashboard = input.dashboard === undefined ? current.dashboard : object(input.dashboard, 'Dashboard');
  const next = { vertical: input.vertical === undefined ? current.vertical : text(input.vertical, 'Vertical', 80)!, capabilities, enabledProviderIds, navigation, terminology, dashboard, analyticsEnabled: input.analyticsEnabled === undefined ? current.analyticsEnabled : Boolean(input.analyticsEnabled), demoModeEnabled: input.demoModeEnabled === undefined ? current.demoModeEnabled : Boolean(input.demoModeEnabled) };
  await db().query(`insert into ophanim_organization_configuration(organization_id,vertical,capabilities,enabled_provider_ids,navigation,terminology,dashboard,analytics_enabled,demo_mode_enabled) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(organization_id) do update set vertical=excluded.vertical,capabilities=excluded.capabilities,enabled_provider_ids=excluded.enabled_provider_ids,navigation=excluded.navigation,terminology=excluded.terminology,dashboard=excluded.dashboard,analytics_enabled=excluded.analytics_enabled,demo_mode_enabled=excluded.demo_mode_enabled,updated_at=now()`, [actor.organizationId, next.vertical, JSON.stringify(next.capabilities), JSON.stringify(next.enabledProviderIds), JSON.stringify(next.navigation), JSON.stringify(next.terminology), JSON.stringify(next.dashboard), next.analyticsEnabled, next.demoModeEnabled]);
  return next;
}
